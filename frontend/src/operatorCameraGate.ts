export interface OperatorExposureControlState {
  operatorMode: boolean;
  operatorRunPage: boolean;
  realCameraSource: boolean;
  sourceRealHardwareAvailable: boolean;
  cameraIdentityAvailable: boolean;
  deviceSetupOpen: boolean;
  temperatureUnavailable: boolean;
}

export function operatorExposureControlCanRead(state: OperatorExposureControlState): boolean {
  return (
    state.operatorMode &&
    state.operatorRunPage &&
    state.realCameraSource &&
    state.sourceRealHardwareAvailable &&
    state.cameraIdentityAvailable &&
    !state.deviceSetupOpen &&
    !state.temperatureUnavailable
  );
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
