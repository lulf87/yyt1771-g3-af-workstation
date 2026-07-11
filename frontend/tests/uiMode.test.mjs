import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-ui-mode-test-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadUiModeModule() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  execFileSync(
    resolve(rootDir, "node_modules/.bin/tsc"),
    [
      "--target",
      "ES2020",
      "--module",
      "ES2020",
      "--moduleResolution",
      "node",
      "--strict",
      "--skipLibCheck",
      "--types",
      "vite/client",
      "--outDir",
      outDir,
      "src/uiMode.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "uiMode.js")).href}?${Date.now()}`);
}

function memoryStorage(entries = {}) {
  const data = new Map(Object.entries(entries));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    }
  };
}

test("UI mode is locked to operator regardless of query or legacy storage", async () => {
  const { UI_MODE_STORAGE_KEY, readInitialUiMode } = await loadUiModeModule();

  assert.equal(readInitialUiMode({ search: "", storage: memoryStorage() }), "operator");
  assert.equal(
    readInitialUiMode({
      search: "",
      storage: memoryStorage({ [UI_MODE_STORAGE_KEY]: "engineering" })
    }),
    "operator"
  );
  assert.equal(
    readInitialUiMode({
      search: "?mode=operator",
      storage: memoryStorage({ [UI_MODE_STORAGE_KEY]: "engineering" })
    }),
    "operator"
  );
  assert.equal(
    readInitialUiMode({
      search: "?mode=engineering",
      storage: memoryStorage()
    }),
    "operator"
  );
});

test("legacy UI mode persistence is disabled", async () => {
  const { UI_MODE_STORAGE_KEY, coerceUiMode, persistUiMode } = await loadUiModeModule();
  const storage = memoryStorage();

  assert.equal(coerceUiMode("operator"), "operator");
  assert.equal(coerceUiMode("engineering"), null);
  assert.equal(coerceUiMode("debug"), null);

  persistUiMode(storage, "engineering");
  assert.equal(storage.getItem(UI_MODE_STORAGE_KEY), null);
});

test("all legacy mode helpers resolve to operator pages and navigation", async () => {
  const { defaultPageForUiMode, normalizePageForUiMode, navItemsForUiMode } = await loadUiModeModule();

  assert.equal(defaultPageForUiMode("operator"), "operatorRun");
  assert.equal(defaultPageForUiMode("engineering"), "operatorRun");
  assert.equal(normalizePageForUiMode("operator", "setup"), "operatorRun");
  assert.equal(normalizePageForUiMode("engineering", "setup"), "operatorRun");
  assert.deepEqual(
    navItemsForUiMode("operator").map((item) => item.label),
    ["Live Test", "History Import", "Results / Export"]
  );
  assert.deepEqual(
    navItemsForUiMode("engineering").map((item) => item.label),
    ["Live Test", "History Import", "Results / Export"]
  );
});
