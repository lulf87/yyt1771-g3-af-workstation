import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildTscCommand } from "./tscTestHelper.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("TypeScript test compiler command avoids platform-specific npm bin shims", () => {
  const command = buildTscCommand(rootDir, ["--version"]);

  assert.equal(command.command, process.execPath);
  assert.equal(command.args[0], resolve(rootDir, "node_modules/typescript/bin/tsc"));
  assert.ok(!command.args[0].includes("node_modules/.bin/tsc"));
});
