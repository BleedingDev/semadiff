#!/usr/bin/env node
import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  process.stderr.write("Usage: run-with-colors <command> [args...]\n");
  process.exit(1);
}

const env = { ...process.env };
env.NO_COLOR = undefined;

const child = spawn(command, args, {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

child.on("error", (error) => {
  process.stderr.write(`Failed to start ${command}: ${error.message}\n`);
  process.exit(1);
});
