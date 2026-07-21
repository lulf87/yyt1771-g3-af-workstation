export type HardwareSetupRefreshResult<T> =
  | { accepted: false }
  | {
      accepted: true;
      status: "fulfilled";
      value: T;
    }
  | {
      accepted: true;
      status: "rejected";
      reason: unknown;
    };

export type HardwareSetupRefreshCoordinator<T> = {
  run(execute: () => Promise<T>): Promise<HardwareSetupRefreshResult<T>>;
  invalidate(): void;
};

export function createHardwareSetupRefreshCoordinator<T>(): HardwareSetupRefreshCoordinator<T> {
  let generation = 0;

  return {
    async run(execute) {
      const requestGeneration = ++generation;
      try {
        const value = await execute();
        if (generation !== requestGeneration) return { accepted: false };
        return { accepted: true, status: "fulfilled", value };
      } catch (reason) {
        if (generation !== requestGeneration) return { accepted: false };
        return { accepted: true, status: "rejected", reason };
      }
    },
    invalidate() {
      generation += 1;
    }
  };
}
