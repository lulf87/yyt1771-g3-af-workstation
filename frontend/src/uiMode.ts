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
  return value === "operator" || value === "engineering" ? value : null;
}

export function readInitialUiMode(
  input: {
    search?: string;
    storage?: StorageLike | null;
  } = {}
): UiMode {
  const search = input.search ?? globalThis.window?.location.search ?? "";
  const queryMode = coerceUiMode(new URLSearchParams(search).get("mode"));
  if (queryMode) return queryMode;
  const storage = input.storage ?? globalThis.window?.localStorage ?? null;
  try {
    return coerceUiMode(storage?.getItem(UI_MODE_STORAGE_KEY)) ?? "operator";
  } catch {
    return "operator";
  }
}

export function persistUiMode(storage: StorageLike | null | undefined, mode: UiMode): void {
  try {
    storage?.setItem(UI_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage can be unavailable in private or restricted browser contexts.
  }
}

export function defaultPageForUiMode(mode: UiMode): AppPage {
  return mode === "operator" ? "operatorRun" : "setup";
}

export function normalizePageForUiMode(mode: UiMode, page: AppPage): AppPage {
  if (mode === "operator") {
    return OPERATOR_PAGES.has(page) ? page : defaultPageForUiMode(mode);
  }
  return ENGINEERING_PAGES.has(page) ? page : defaultPageForUiMode(mode);
}

export function navItemsForUiMode(mode: UiMode): AppNavItem[] {
  if (mode === "operator") {
    return [
      { page: "operatorRun", label: "Live Test" },
      { page: "operatorImport", label: "History Import" },
      { page: "operatorResults", label: "Results / Export" }
    ];
  }
  return [
    { page: "setup", label: "Setup" },
    { page: "run", label: "Run" },
    { page: "playback", label: "Playback" },
    { page: "analysis", label: "Analysis / Export" }
  ];
}

export function pageForSetupSourceEffects(page: AppPage): "setup" | "run" | "playback" | "analysis" {
  if (page === "operatorRun") return "setup";
  if (page === "operatorImport") return "playback";
  if (page === "operatorResults") return "analysis";
  return page;
}
