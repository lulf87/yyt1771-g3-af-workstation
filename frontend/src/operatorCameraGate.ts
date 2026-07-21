export interface OperatorExposureControlState {
  operatorMode: boolean;
  operatorRunPage: boolean;
  realCameraSource: boolean;
  sourceOperationAllowed: boolean;
  cameraIdentityAvailable: boolean;
  deviceSetupOpen: boolean;
  temperatureUnavailable: boolean;
}

export function operatorExposureControlCanRead(state: OperatorExposureControlState): boolean {
  return (
    state.operatorMode &&
    state.operatorRunPage &&
    state.realCameraSource &&
    state.sourceOperationAllowed &&
    state.cameraIdentityAvailable &&
    !state.deviceSetupOpen &&
    !state.temperatureUnavailable
  );
}

export type OperatorExposureReadActivation = {
  readKey: string | null;
  pending: boolean;
};

export type OperatorExposureReadGate = {
  activate(readable: boolean, cameraKey: string): OperatorExposureReadActivation;
  settle(readKey: string | null): boolean;
};

export function createOperatorExposureReadGate(): OperatorExposureReadGate {
  let activeCameraKey: string | null = null;
  let activeReadKey: string | null = null;
  let settledReadKey: string | null = null;
  let generation = 0;

  return {
    activate(readable, cameraKey) {
      if (!readable) {
        activeCameraKey = null;
        activeReadKey = null;
        return { readKey: null, pending: false };
      }
      if (activeCameraKey !== cameraKey || activeReadKey === null) {
        generation += 1;
        activeCameraKey = cameraKey;
        activeReadKey = `${cameraKey}::${generation}`;
      }
      return {
        readKey: activeReadKey,
        pending: activeReadKey !== settledReadKey
      };
    },
    settle(readKey) {
      if (readKey === null || readKey !== activeReadKey) return false;
      settledReadKey = readKey;
      return true;
    }
  };
}

type OperatorSourcePresentationStatus = {
  operation_allowed?: boolean;
  development_fake_available?: boolean;
  real_hardware_available?: boolean;
  provenance?: { overall_kind?: string };
};

export type OperatorSourcePresentation = {
  sourceAvailable: boolean;
  realHardwareAvailable: boolean;
  developmentFakeAvailable: boolean;
  badgeLabel: "Simulated material debug" | "Development fake hardware" | "Real hardware ready" | "Real hardware unavailable";
};

export function operatorSourcePresentation(
  status: OperatorSourcePresentationStatus | null,
  simulatedMode: boolean,
  temperatureUnavailable: boolean
): OperatorSourcePresentation {
  const developmentFakeAvailable =
    status?.development_fake_available === true ||
    status?.provenance?.overall_kind === "development_fake";
  const realHardwareAvailable =
    status?.real_hardware_available === true && !temperatureUnavailable;
  const sourceAvailable =
    simulatedMode ||
    (status?.operation_allowed === true && !temperatureUnavailable);
  return {
    sourceAvailable,
    realHardwareAvailable,
    developmentFakeAvailable,
    badgeLabel: simulatedMode
      ? "Simulated material debug"
      : developmentFakeAvailable
        ? "Development fake hardware"
        : realHardwareAvailable
          ? "Real hardware ready"
          : "Real hardware unavailable"
  };
}

export function operatorExposureReadPending(
  state: OperatorExposureControlState,
  reactivationPending: boolean
): boolean {
  return operatorExposureControlCanRead(state) && reactivationPending;
}

export function runOperatorCameraAction<T>(locked: boolean, action: () => T): T | undefined {
  if (locked) return undefined;
  return action();
}
