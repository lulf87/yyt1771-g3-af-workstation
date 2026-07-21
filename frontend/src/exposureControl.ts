import type { CameraExposureIdentity } from "./api/client.js";

export type CameraExposureReadResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

export type CameraExposureReadSession = {
  read<T>(
    camera: CameraExposureIdentity | null,
    execute: (camera: CameraExposureIdentity | null) => Promise<T>,
    apply: (result: CameraExposureReadResult<T>) => void
  ): Promise<boolean>;
  invalidate(): void;
};

export function cameraExposureIdentityKey(
  camera: CameraExposureIdentity | null
): string {
  return camera
    ? JSON.stringify([
        camera.backend,
        camera.transport,
        camera.model,
        camera.serial_number,
        camera.ip,
        camera.user_defined_name
      ])
    : "saved-camera";
}

export function createCameraExposureReadSession(): CameraExposureReadSession {
  let generation = 0;

  return {
    async read(camera, execute, apply) {
      const requestGeneration = ++generation;
      try {
        const value = await execute(camera);
        if (generation !== requestGeneration) return false;
        apply({ status: "fulfilled", value });
      } catch (reason) {
        if (generation !== requestGeneration) return false;
        apply({ status: "rejected", reason });
      }
      return true;
    },
    invalidate() {
      generation += 1;
    }
  };
}

export type ExposureApplyResponse = { actual_us: number };

export type ExposureCoordinatorOptions<
  T extends ExposureApplyResponse = ExposureApplyResponse
> = {
  delayMs: number;
  apply: (value: number, signal: AbortSignal) => Promise<T>;
  onBusyChange?: (busy: boolean) => void;
  onPending?: (value: number) => void;
  onSuccess: (
    actualUs: number,
    response: T,
    context: { isLatestIntent: boolean }
  ) => void;
  onError: (error: unknown) => void;
  setTimer: (
    callback: () => void,
    delayMs: number
  ) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
};

export type ExposureCommitCoordinator = {
  schedule(value: number): void;
  commit(value: number): void;
  cancel(): void;
  dispose(): void;
};

export type ExposureBusyTracker = {
  begin(): () => void;
};

export function createExposureBusyTracker(
  onBusyChange: (busy: boolean) => void
): ExposureBusyTracker {
  let activeOperations = 0;

  return {
    begin() {
      activeOperations += 1;
      if (activeOperations === 1) onBusyChange(true);
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        activeOperations -= 1;
        if (activeOperations === 0) onBusyChange(false);
      };
    }
  };
}

export type ExposureDraftSubmission =
  | { kind: "rejected"; reason: "finite" | "range" }
  | { kind: "cancelled"; reason: "finite" | "range" }
  | {
      kind: "compensating" | "compensation_pending";
      reason: "finite" | "range";
      value: number;
    }
  | { kind: "unchanged"; value: number }
  | { kind: "pending"; value: number }
  | { kind: "submitted"; value: number };

export type ExposureIntent = {
  latestIntentUs: number;
  lastRequestedUs: null;
};

export function scheduleExposureDraft({
  value,
  coordinator,
  onIntent
}: {
  value: number;
  coordinator: Pick<ExposureCommitCoordinator, "schedule">;
  onIntent: (intent: ExposureIntent) => void;
}): void {
  onIntent({ latestIntentUs: value, lastRequestedUs: null });
  coordinator.schedule(value);
}

export function submitExposureDraft({
  draft,
  minimumUs,
  maximumUs,
  confirmedUs,
  latestIntentUs,
  lastRequestedUs,
  compensationPending,
  coordinator
}: {
  draft: string;
  minimumUs: number | null;
  maximumUs: number | null;
  confirmedUs: number | null;
  latestIntentUs: number | null;
  lastRequestedUs: number | null;
  compensationPending: boolean;
  coordinator: Pick<ExposureCommitCoordinator, "cancel" | "commit">;
}): ExposureDraftSubmission {
  let value = Number.NaN;
  let rejectionReason: "finite" | "range" | null = null;
  if (!draft.trim()) {
    rejectionReason = "finite";
  } else {
    value = Number(draft);
    if (!Number.isFinite(value)) {
      rejectionReason = "finite";
    } else if (
      (minimumUs !== null && value < minimumUs) ||
      (maximumUs !== null && value > maximumUs)
    ) {
      rejectionReason = "range";
    }
  }

  if (rejectionReason !== null) {
    if (
      compensationPending &&
      confirmedUs !== null &&
      Number.isFinite(confirmedUs)
    ) {
      return {
        kind: "compensation_pending",
        reason: rejectionReason,
        value: confirmedUs
      };
    }
    if (latestIntentUs !== null) {
      coordinator.cancel();
      if (confirmedUs !== null && Number.isFinite(confirmedUs)) {
        coordinator.commit(confirmedUs);
        return {
          kind: "compensating",
          reason: rejectionReason,
          value: confirmedUs
        };
      }
      return { kind: "cancelled", reason: rejectionReason };
    }
    return { kind: "rejected", reason: rejectionReason };
  }
  if (lastRequestedUs === value) {
    return { kind: "pending", value };
  }
  if (confirmedUs === value && latestIntentUs === null) {
    return { kind: "unchanged", value };
  }
  coordinator.commit(value);
  return { kind: "submitted", value };
}

export function createExposureCommitCoordinator<T extends ExposureApplyResponse>(
  options: ExposureCoordinatorOptions<T>
): ExposureCommitCoordinator {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active:
    | {
        controller: AbortController;
        intentId: number;
      }
    | null = null;
  let queued: { value: number; intentId: number } | null = null;
  let latestIntentId = 0;
  let disposed = false;
  let busy = false;

  function syncBusy(): void {
    const nextBusy = timer !== null || active !== null || queued !== null;
    if (nextBusy === busy) return;
    busy = nextBusy;
    options.onBusyChange?.(busy);
  }

  function clearPendingTimer(): void {
    if (timer !== null) {
      options.clearTimer(timer);
      timer = null;
    }
  }

  function nextIntentId(): number {
    latestIntentId += 1;
    return latestIntentId;
  }

  function enqueueOrApply(value: number, intentId: number): void {
    if (disposed) return;
    if (active !== null) {
      queued = { value, intentId };
      syncBusy();
      return;
    }
    void apply(value, intentId);
    syncBusy();
  }

  async function apply(value: number, intentId: number): Promise<void> {
    if (disposed || active !== null) return;
    const controller = new AbortController();
    const current = { controller, intentId };
    active = current;

    try {
      options.onPending?.(value);
      const response = await options.apply(value, controller.signal);
      if (disposed || controller.signal.aborted || active !== current) {
        return;
      }
      options.onSuccess(response.actual_us, response, {
        isLatestIntent: intentId === latestIntentId
      });
    } catch (error) {
      if (
        disposed ||
        controller.signal.aborted ||
        active !== current ||
        intentId !== latestIntentId
      ) {
        return;
      }
      options.onError(error);
    } finally {
      if (active === current) {
        active = null;
      }
      if (!disposed && active === null && queued !== null) {
        const next = queued;
        queued = null;
        enqueueOrApply(next.value, next.intentId);
      }
      syncBusy();
    }
  }

  return {
    schedule(value) {
      if (disposed) {
        return;
      }
      clearPendingTimer();
      queued = null;
      const intentId = nextIntentId();
      timer = options.setTimer(() => {
        timer = null;
        enqueueOrApply(value, intentId);
      }, options.delayMs);
      syncBusy();
    },
    commit(value) {
      if (disposed) {
        return;
      }
      clearPendingTimer();
      queued = null;
      enqueueOrApply(value, nextIntentId());
    },
    cancel() {
      if (disposed) {
        return;
      }
      clearPendingTimer();
      queued = null;
      nextIntentId();
      syncBusy();
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      clearPendingTimer();
      queued = null;
      nextIntentId();
      syncBusy();
    }
  };
}
