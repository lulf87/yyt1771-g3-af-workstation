export type CameraBusyOwnerToken = symbol;

export type CameraBusyOwnerRegistry = {
  setOwnerBusy(owner: CameraBusyOwnerToken, busy: boolean): void;
  isBusy(): boolean;
};

export function createCameraBusyOwnerToken(): CameraBusyOwnerToken {
  return Symbol("camera-busy-owner");
}

export function createCameraBusyOwnerRegistry(
  onBusyChange: (busy: boolean) => void
): CameraBusyOwnerRegistry {
  const activeOwners = new Set<CameraBusyOwnerToken>();

  return {
    setOwnerBusy(owner, busy) {
      const wasBusy = activeOwners.size > 0;
      if (busy) activeOwners.add(owner);
      else activeOwners.delete(owner);
      const isBusy = activeOwners.size > 0;
      if (isBusy !== wasBusy) onBusyChange(isBusy);
    },
    isBusy() {
      return activeOwners.size > 0;
    }
  };
}

export function runWhenCameraIdle(
  registry: Pick<CameraBusyOwnerRegistry, "isBusy">,
  action: () => void
): boolean {
  if (registry.isBusy()) return false;
  action();
  return true;
}
