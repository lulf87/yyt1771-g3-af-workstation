export type HardwareProfileRefreshResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

export type HardwareProfileRefreshSession = {
  refresh<T>(
    execute: () => Promise<T>,
    apply: (result: HardwareProfileRefreshResult<T>) => void
  ): Promise<boolean>;
};

export function createHardwareProfileRefreshSession(): HardwareProfileRefreshSession {
  let generation = 0;

  return {
    async refresh(execute, apply) {
      const requestGeneration = ++generation;
      try {
        const value = await execute();
        if (generation !== requestGeneration) return false;
        apply({ status: "fulfilled", value });
      } catch (reason) {
        if (generation !== requestGeneration) return false;
        apply({ status: "rejected", reason });
      }
      return true;
    }
  };
}
