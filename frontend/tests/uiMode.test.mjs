import assert from "node:assert/strict";
import { execTscSync } from "./tscTestHelper.mjs";
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
  execTscSync(
    rootDir,
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

test("UI mode defaults to operator, honors saved engineering, and query overrides both", async () => {
  const { UI_MODE_STORAGE_KEY, readInitialUiMode } = await loadUiModeModule();

  assert.equal(readInitialUiMode({ search: "", storage: memoryStorage() }), "operator");
  assert.equal(
    readInitialUiMode({
      search: "",
      storage: memoryStorage({ [UI_MODE_STORAGE_KEY]: "engineering" })
    }),
    "engineering"
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
    "engineering"
  );
});

test("persisted UI mode only accepts operator and engineering", async () => {
  const { UI_MODE_STORAGE_KEY, coerceUiMode, persistUiMode } = await loadUiModeModule();
  const storage = memoryStorage();

  assert.equal(coerceUiMode("operator"), "operator");
  assert.equal(coerceUiMode("engineering"), "engineering");
  assert.equal(coerceUiMode("debug"), null);

  persistUiMode(storage, "engineering");
  assert.equal(storage.getItem(UI_MODE_STORAGE_KEY), "engineering");
});

test("operator and engineering modes use distinct default pages and nav", async () => {
  const { defaultPageForUiMode, normalizePageForUiMode, navItemsForUiMode } = await loadUiModeModule();

  assert.equal(defaultPageForUiMode("operator"), "operatorRun");
  assert.equal(defaultPageForUiMode("engineering"), "setup");
  assert.equal(normalizePageForUiMode("operator", "setup"), "operatorRun");
  assert.equal(normalizePageForUiMode("engineering", "operatorImport"), "setup");
  assert.deepEqual(
    navItemsForUiMode("operator").map((item) => item.label),
    ["Live Test", "History Import", "Results / Export"]
  );
  assert.deepEqual(
    navItemsForUiMode("engineering").map((item) => item.label),
    ["Setup", "Run", "Playback", "Analysis / Export"]
  );
});
