#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadBenchmarkCases } from "./cases.js";
import { runBenchmarkComparisonSuite } from "./compare.js";
import { runBenchmarkSuite } from "./run.js";

interface CliOptions {
  cases: string;
  output?: string | undefined;
  help: boolean;
  tools: string[];
}

function usage() {
  return [
    "Usage: benchmark-harness [--cases <dir>] [--output <file>] [--tools <list>]",
    "",
    "Options:",
    "  --cases   Benchmark case root directory (default: bench/cases/gold/micro)",
    "  --output  Write the JSON report to a file as well as stdout",
    "  --tools   Comma-separated tools (default: semadiff)",
    "  --help    Show this message",
  ].join("\n");
}

function readOptionValue(
  argv: readonly string[],
  index: number,
  flag: string
): { value: string; nextIndex: number } {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return {
    value,
    nextIndex: index + 1,
  };
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    cases: "bench/cases/gold/micro",
    help: false,
    tools: ["semadiff"],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    switch (value) {
      case "--":
        break;
      case "--help":
        options.help = true;
        break;
      case "--cases": {
        const parsed = readOptionValue(argv, index, "--cases");
        options.cases = parsed.value;
        index = parsed.nextIndex;
        break;
      }
      case "--output": {
        const parsed = readOptionValue(argv, index, "--output");
        options.output = parsed.value;
        index = parsed.nextIndex;
        break;
      }
      case "--tools": {
        const parsed = readOptionValue(argv, index, "--tools");
        options.tools = parsed.value
          .split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
        if (options.tools.length === 0) {
          throw new Error("Expected at least one tool name for --tools.");
        }
        index = parsed.nextIndex;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${value}`);
    }
  }

  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }

  const caseRoot = resolve(process.cwd(), options.cases);
  const benchmarkCases = loadBenchmarkCases(caseRoot);
  const report =
    options.tools.length === 1 && options.tools[0] === "semadiff"
      ? runBenchmarkSuite(benchmarkCases, { caseRoot })
      : runBenchmarkComparisonSuite(benchmarkCases, {
          caseRoot,
          tools: options.tools,
        });
  const output = `${JSON.stringify(report, null, 2)}\n`;

  if (options.output) {
    const outputPath = resolve(process.cwd(), options.output);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, output);
  }

  process.stdout.write(output);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
