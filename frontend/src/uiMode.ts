export type UiMode = "operator" | "engineering";

export type AppPage =
  | "setup"
  | "run"
  | "playback"
  | "analysis"
  | "operatorRun"
  | "operatorImport"
  | "operatorResults";

export type AppNavItem = {
  page: AppPage;
  label: string;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const UI_MODE_STORAGE_KEY = "yyt1771-g3-ui-mode";

const OPERATOR_PAGES = new Set<AppPage>(["operatorRun", "operatorImport", "operatorResults"]);
const ENGINEERING_PAGES = new Set<AppPage>(["setup", "run", "playback", "analysis"]);

export function coerceUiMode(value: string | null | undefined): UiMode | null {
  return value === "operator" ? value : null;
}

export function readInitialUiMode(
  input: {
    search?: string;
    storage?: StorageLike | null;
  } = {}
): UiMode {
  void input;
  return "operator";
}

export function persistUiMode(storage: StorageLike | null | undefined, mode: UiMode): void {
  void storage;
  void mode;
}

export function defaultPageForUiMode(mode: UiMode): AppPage {
  void mode;
  return "operatorRun";
}

export function normalizePageForUiMode(mode: UiMode, page: AppPage): AppPage {
  void mode;
  return OPERATOR_PAGES.has(page) ? page : "operatorRun";
}

export function navItemsForUiMode(mode: UiMode): AppNavItem[] {
  void mode;
  return [
    { page: "operatorRun", label: "Live Test" },
    { page: "operatorImport", label: "History Import" },
    { page: "operatorResults", label: "Results / Export" }
  ];
}

export function pageForSetupSourceEffects(page: AppPage): "setup" | "run" | "playback" | "analysis" {
  if (page === "operatorRun") return "setup";
  if (page === "operatorImport") return "playback";
  if (page === "operatorResults") return "analysis";
  return page;
}
