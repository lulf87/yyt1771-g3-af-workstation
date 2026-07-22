import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-export-save-target-test-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadExportSaveTargetModule() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  execFileSync(
    process.execPath,
    [
      resolve(rootDir, "node_modules/typescript/bin/tsc"),
      "--target",
      "ES2020",
      "--module",
      "ES2020",
      "--moduleResolution",
      "node",
      "--strict",
      "--skipLibCheck",
      "--lib",
      "ES2020,DOM",
      "--outDir",
      outDir,
      "src/exportSaveTarget.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "exportSaveTarget.js")).href}?${Date.now()}`);
}

test("export save target detects File System Access API support", async () => {
  const { isExportDirectoryPickerSupported } = await loadExportSaveTargetModule();

  assert.equal(isExportDirectoryPickerSupported({ showDirectoryPicker: async () => ({}) }), true);
  assert.equal(isExportDirectoryPickerSupported({}), false);
  assert.equal(isExportDirectoryPickerSupported(null), false);
});

test("export save target writes a blob into the selected directory", async () => {
  const { writeBlobToDirectory } = await loadExportSaveTargetModule();
  const writes = [];
  const handle = {
    async queryPermission() {
      return "granted";
    },
    async getFileHandle(filename, options) {
      writes.push({ kind: "file", filename, options });
      return {
        async createWritable() {
          return {
            async write(blob) {
              writes.push({ kind: "write", size: blob.size });
            },
            async close() {
              writes.push({ kind: "close" });
            }
          };
        }
      };
    }
  };

  await writeBlobToDirectory(handle, "bundle.zip", new Blob(["zip-bytes"]));

  assert.deepEqual(writes, [
    { kind: "file", filename: "bundle.zip", options: { create: true } },
    { kind: "write", size: 9 },
    { kind: "close" }
  ]);
});

test("export save target source persists the last directory handle with IndexedDB", () => {
  const source = readFileSync(resolve(rootDir, "src/exportSaveTarget.ts"), "utf8");

  assert.match(source, /indexedDB\.open/);
  assert.match(source, /EXPORT_DIRECTORY_DB_NAME/);
  assert.match(source, /LAST_EXPORT_DIRECTORY_KEY/);
  assert.match(source, /put\(handle,\s*LAST_EXPORT_DIRECTORY_KEY\)/);
  assert.match(source, /get\(LAST_EXPORT_DIRECTORY_KEY\)/);
});

test("operator export result button opens the guided export dialog before saving", () => {
  const source = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");
  const start = source.indexOf("function OperatorResultsPage({");
  const end = source.indexOf("function ImportedRunSummary(", start);
  assert.notEqual(start, -1, "OperatorResultsPage should exist");
  assert.notEqual(end, -1, "ImportedRunSummary should follow OperatorResultsPage");
  const block = source.slice(start, end);

  assert.match(block, /setExportDialogOpen\(true\)/);
  assert.match(block, /<ExportSaveDialog/);
  assert.doesNotMatch(block, /downloadRunExportBundle\(currentRunId\)/);
});

test("export dialog source uses backend-managed native export destination", () => {
  const source = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");
  const start = source.indexOf("function ExportSaveDialog(");
  const end = source.indexOf("function ImportedRunSummary(", start);
  assert.notEqual(start, -1, "ExportSaveDialog should exist");
  assert.notEqual(end, -1, "ImportedRunSummary should follow ExportSaveDialog");
  const block = source.slice(start, end);

  assert.match(block, /getExportDestination/);
  assert.match(block, /chooseExportDestination/);
  assert.match(block, /openExportDestination/);
  assert.match(block, /resetExportDestination/);
  assert.match(block, /saveRunExportBundle/);
  assert.doesNotMatch(block, /showDirectoryPicker/);
  assert.doesNotMatch(block, /FileSystemDirectoryHandle/);
  assert.doesNotMatch(block, /indexedDB/);
});
