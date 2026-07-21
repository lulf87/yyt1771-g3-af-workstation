export type ExposureApplyResponse = { actual_us: number };

export type ExposureCoordinatorOptions<
  T extends ExposureApplyResponse = ExposureApplyResponse
> = {
  delayMs: number;
  apply: (value: number, signal: AbortSignal) => Promise<T>;
  onPending?: (value: number) => void;
  onSuccess: (actualUs: number, response: T) => void;
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
  dispose(): void;
};

export type ExposureDraftSubmission =
  | { kind: "rejected"; reason: "finite" | "range" }
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
  coordinator
}: {
  draft: string;
  minimumUs: number | null;
  maximumUs: number | null;
  confirmedUs: number | null;
  latestIntentUs: number | null;
  lastRequestedUs: number | null;
  coordinator: Pick<ExposureCommitCoordinator, "commit">;
}): ExposureDraftSubmission {
  if (!draft.trim()) {
    return { kind: "rejected", reason: "finite" };
  }
  const value = Number(draft);
  if (!Number.isFinite(value)) {
    return { kind: "rejected", reason: "finite" };
  }
  if (
    (minimumUs !== null && value < minimumUs) ||
    (maximumUs !== null && value > maximumUs)
  ) {
    return { kind: "rejected", reason: "range" };
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
  let activeController: AbortController | null = null;
  let requestId = 0;
  let disposed = false;

  function clearPendingTimer(): void {
    if (timer !== null) {
      options.clearTimer(timer);
      timer = null;
    }
  }

  function invalidateActiveRequest(): void {
    requestId += 1;
    activeController?.abort();
    activeController = null;
  }

  async function apply(value: number): Promise<void> {
    if (disposed) {
      return;
    }

    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const currentId = ++requestId;
    options.onPending?.(value);

    try {
      const response = await options.apply(value, controller.signal);
      if (controller.signal.aborted || currentId !== requestId) {
        return;
      }
      options.onSuccess(response.actual_us, response);
    } catch (error) {
      if (controller.signal.aborted || currentId !== requestId) {
        return;
      }
      options.onError(error);
    } finally {
      if (currentId === requestId && activeController === controller) {
        activeController = null;
      }
    }
  }

  return {
    schedule(value) {
      if (disposed) {
        return;
      }
      clearPendingTimer();
      invalidateActiveRequest();
      timer = options.setTimer(() => {
        timer = null;
        void apply(value);
      }, options.delayMs);
    },
    commit(value) {
      if (disposed) {
        return;
      }
      clearPendingTimer();
      void apply(value);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      clearPendingTimer();
      invalidateActiveRequest();
    }
  };
}
