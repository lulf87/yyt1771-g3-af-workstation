export const OPERATOR_TEMPERATURE_POLL_INTERVAL_MS = 500;

export type OperatorTemperaturePollingState = {
  uiMode: string;
  page: string;
  operatorDataSource: string;
  realHardwareAvailable: boolean;
  realTemperatureAvailable: boolean;
  hasTemperatureError: boolean;
  runningCamera: boolean;
  runningOffline: boolean;
};

export function shouldAutoPollOperatorTemperature(state: OperatorTemperaturePollingState): boolean {
  return (
    state.uiMode === "operator" &&
    state.page === "operatorRun" &&
    state.operatorDataSource === "real_camera" &&
    state.realHardwareAvailable &&
    state.realTemperatureAvailable &&
    !state.hasTemperatureError &&
    !state.runningCamera &&
    !state.runningOffline
  );
}
