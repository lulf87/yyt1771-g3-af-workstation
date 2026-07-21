export type HardwareCameraTestResult<T> =
  | { accepted: false; cameraKey: string }
  | {
      accepted: true;
      cameraKey: string;
      status: "fulfilled";
      value: T;
    }
  | {
      accepted: true;
      cameraKey: string;
      status: "rejected";
      reason: unknown;
    };

export type HardwareCameraTestCoordinator<T> = {
  run(
    cameraKey: string,
    execute: () => Promise<T>
  ): Promise<HardwareCameraTestResult<T>>;
  invalidate(): void;
};

export function isHardwareCameraTestResultCurrent<T>(
  result: HardwareCameraTestResult<T>,
  selectedCameraKey: string
): result is Extract<HardwareCameraTestResult<T>, { accepted: true }> {
  return result.accepted && result.cameraKey === selectedCameraKey;
}

export function createHardwareCameraTestCoordinator<T>(): HardwareCameraTestCoordinator<T> {
  let generation = 0;
  let activeCameraKey: string | null = null;

  function isCurrent(cameraKey: string, requestGeneration: number): boolean {
    return generation === requestGeneration && activeCameraKey === cameraKey;
  }

  return {
    async run(cameraKey, execute) {
      const requestGeneration = ++generation;
      activeCameraKey = cameraKey;
      try {
        const value = await execute();
        if (!isCurrent(cameraKey, requestGeneration)) {
          return { accepted: false, cameraKey };
        }
        return { accepted: true, cameraKey, status: "fulfilled", value };
      } catch (reason) {
        if (!isCurrent(cameraKey, requestGeneration)) {
          return { accepted: false, cameraKey };
        }
        return { accepted: true, cameraKey, status: "rejected", reason };
      }
    },
    invalidate() {
      generation += 1;
      activeCameraKey = null;
    }
  };
}
