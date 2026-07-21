export type ExposureApplyResponse = { actual_us: number };

export type ExposureCoordinatorOptions<
  T extends ExposureApplyResponse = ExposureApplyResponse
> = {
  delayMs: number;
  apply: (value: number, signal: AbortSignal) => Promise<T>;
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
      return;
    }
    void apply(value, intentId);
  }

  async function apply(value: number, intentId: number): Promise<void> {
    if (disposed || active !== null) return;
    const controller = new AbortController();
    const current = { controller, intentId };
    active = current;
    options.onPending?.(value);

    try {
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
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      clearPendingTimer();
      queued = null;
      nextIntentId();
      active?.controller.abort();
    }
  };
}
