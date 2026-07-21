import {
  createHardwareSetupOperationCoordinator,
  type HardwareSetupOperationResult,
  type HardwareSetupOperationScope
} from "./hardwareSetupRefreshCoordinator.js";

const HARDWARE_SETUP_BUSY_OWNERS = [
  "loadingWizard",
  "testingCamera",
  "testingTemperature",
  "testingBinding",
  "savingBinding",
  "savingSdkPaths"
] as const;

export type HardwareSetupBusyOwner =
  (typeof HARDWARE_SETUP_BUSY_OWNERS)[number];

type AcceptedHardwareSetupOperationResult<T> = Exclude<
  HardwareSetupOperationResult<T>,
  { accepted: false }
>;

type HardwareSetupSessionOptions = {
  onBusyChange(owner: HardwareSetupBusyOwner, busy: boolean): void;
};

type HardwareSetupOperationMethod = <T>(
  execute: (scope: HardwareSetupOperationScope) => Promise<T>,
  apply: (result: AcceptedHardwareSetupOperationResult<T>) => void
) => Promise<boolean>;

export type HardwareSetupSaveBindingStages<TFresh, TSaved, TRefresh> = {
  recheck(scope: HardwareSetupOperationScope): Promise<TFresh>;
  shouldPersist(freshTestResult: TFresh): boolean;
  persist(
    freshTestResult: TFresh,
    scope: HardwareSetupOperationScope
  ): Promise<TSaved>;
  refresh(
    freshTestResult: TFresh,
    savedBinding: TSaved,
    scope: HardwareSetupOperationScope
  ): Promise<TRefresh>;
};

export type HardwareSetupSaveBindingResult<TFresh, TSaved, TRefresh> = {
  freshTestResult: TFresh;
  savedBinding: TSaved | null;
  refreshResult: TRefresh | null;
};

export type HardwareSetupSession = {
  commitOpen(open: boolean): void;
  isOpen(): boolean;
  invalidateOperations(): void;
  refreshWizardData: HardwareSetupOperationMethod;
  refreshEnvironmentChecks: HardwareSetupOperationMethod;
  validateAndSaveSdkPaths: HardwareSetupOperationMethod;
  scanHardwareCameras: HardwareSetupOperationMethod;
  refreshTemperaturePorts: HardwareSetupOperationMethod;
  runCameraTest: HardwareSetupOperationMethod;
  runTemperatureTest: HardwareSetupOperationMethod;
  runBindingTest: HardwareSetupOperationMethod;
  saveBinding<TFresh, TSaved, TRefresh>(
    stages: HardwareSetupSaveBindingStages<TFresh, TSaved, TRefresh>,
    apply: (
      result: AcceptedHardwareSetupOperationResult<
        HardwareSetupSaveBindingResult<TFresh, TSaved, TRefresh>
      >
    ) => void
  ): Promise<boolean>;
};

const STALE_HARDWARE_SETUP_STAGE = Symbol("stale-hardware-setup-stage");

export function createHardwareSetupSession(
  options: HardwareSetupSessionOptions
): HardwareSetupSession {
  const coordinator = createHardwareSetupOperationCoordinator();
  let committedOpen = false;
  let activeOwner: HardwareSetupBusyOwner | null = null;
  let activeToken = 0;

  function resetBusyOwners(): void {
    activeToken += 1;
    activeOwner = null;
    for (const owner of HARDWARE_SETUP_BUSY_OWNERS) {
      options.onBusyChange(owner, false);
    }
  }

  function invalidateOperations(): void {
    coordinator.invalidate();
    resetBusyOwners();
  }

  async function run<T>(
    owner: HardwareSetupBusyOwner,
    execute: (scope: HardwareSetupOperationScope) => Promise<T>,
    apply: (result: AcceptedHardwareSetupOperationResult<T>) => void
  ): Promise<boolean> {
    if (!committedOpen) return false;

    if (activeOwner !== null) {
      options.onBusyChange(activeOwner, false);
    }
    const operationToken = ++activeToken;
    activeOwner = owner;
    options.onBusyChange(owner, true);

    const result = await coordinator.run(execute);
    if (
      !result.accepted ||
      !committedOpen ||
      activeToken !== operationToken ||
      activeOwner !== owner
    ) {
      return false;
    }

    try {
      apply(result);
    } finally {
      if (activeToken === operationToken && activeOwner === owner) {
        activeOwner = null;
        options.onBusyChange(owner, false);
      }
    }
    return true;
  }

  function operation(owner: HardwareSetupBusyOwner): HardwareSetupOperationMethod {
    return (execute, apply) => run(owner, execute, apply);
  }

  const refreshWizardData = operation("loadingWizard");
  const refreshEnvironmentChecks = operation("loadingWizard");
  const validateAndSaveSdkPaths = operation("savingSdkPaths");
  const scanHardwareCameras = operation("loadingWizard");
  const refreshTemperaturePorts = operation("loadingWizard");
  const runCameraTest = operation("testingCamera");
  const runTemperatureTest = operation("testingTemperature");
  const runBindingTest = operation("testingBinding");

  return {
    commitOpen(open) {
      coordinator.invalidate();
      committedOpen = open;
      resetBusyOwners();
    },
    isOpen() {
      return committedOpen;
    },
    invalidateOperations,
    refreshWizardData,
    refreshEnvironmentChecks,
    validateAndSaveSdkPaths,
    scanHardwareCameras,
    refreshTemperaturePorts,
    runCameraTest,
    runTemperatureTest,
    runBindingTest,
    saveBinding(stages, apply) {
      return run(
        "savingBinding",
        async (scope) => {
          const freshTestResult = await stages.recheck(scope);
          if (!scope.isCurrent()) throw STALE_HARDWARE_SETUP_STAGE;
          if (!stages.shouldPersist(freshTestResult)) {
            return {
              freshTestResult,
              savedBinding: null,
              refreshResult: null
            };
          }

          const savedBinding = await stages.persist(freshTestResult, scope);
          if (!scope.isCurrent()) throw STALE_HARDWARE_SETUP_STAGE;
          const refreshResult = await stages.refresh(
            freshTestResult,
            savedBinding,
            scope
          );
          if (!scope.isCurrent()) throw STALE_HARDWARE_SETUP_STAGE;
          return { freshTestResult, savedBinding, refreshResult };
        },
        apply
      );
    }
  };
}
