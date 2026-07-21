export type HardwareSetupOperationResult<T> =
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

export type HardwareSetupOperationScope = {
  isCurrent(): boolean;
};

export type HardwareSetupOperationCoordinator = {
  run<T>(
    execute: (scope: HardwareSetupOperationScope) => Promise<T>
  ): Promise<HardwareSetupOperationResult<T>>;
  invalidate(): void;
};

export function createHardwareSetupOperationCoordinator(): HardwareSetupOperationCoordinator {
  let generation = 0;

  return {
    async run(execute) {
      const requestGeneration = ++generation;
      const scope: HardwareSetupOperationScope = {
        isCurrent: () => generation === requestGeneration
      };
      try {
        const value = await execute(scope);
        if (!scope.isCurrent()) return { accepted: false };
        return { accepted: true, status: "fulfilled", value };
      } catch (reason) {
        if (!scope.isCurrent()) return { accepted: false };
        return { accepted: true, status: "rejected", reason };
      }
    },
    invalidate() {
      generation += 1;
    }
  };
}
