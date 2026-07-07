import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export function buildTscCommand(rootDir, args) {
  return {
    command: process.execPath,
    args: [resolve(rootDir, "node_modules/typescript/bin/tsc"), ...args]
  };
}

export function execTscSync(rootDir, args, options) {
  const command = buildTscCommand(rootDir, args);
  execFileSync(command.command, command.args, options);
}
