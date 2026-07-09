export const OPERATOR_TEMPERATURE_IDLE_POLL_MS = 500;

export type OperatorTemperaturePollingState = {
  uiMode: string;
  page: string;
  operatorDataSource: string;
  realTemperatureAvailable: boolean;
  hasTemperatureError: boolean;
  runningCamera: boolean;
  runningOffline: boolean;
  hardwareSetupWizardOpen: boolean;
};

export function shouldAutoPollOperatorTemperature(state: OperatorTemperaturePollingState): boolean {
  return (
    state.uiMode === "operator" &&
    state.page === "operatorRun" &&
    state.operatorDataSource === "real_camera" &&
    state.realTemperatureAvailable &&
    !state.hasTemperatureError &&
    !state.runningCamera &&
    !state.runningOffline &&
    !state.hardwareSetupWizardOpen
  );
}
