import { existsSync } from "node:fs";
import { Schema } from "effect";

const DEFAULT_OWNER = "NMIT-WR";
const DEFAULT_REPO = "new-engine";
const bun = globalThis.Bun;
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg?.startsWith("--")) {
    continue;
  }
  const [rawKey, inlineValue] = arg.split("=", 2);
  const key = rawKey.slice(2);
  if (inlineValue !== undefined) {
    args.set(key, inlineValue);
    continue;
  }
  const next = process.argv[i + 1];
  if (next && !next.startsWith("--")) {
    args.set(key, next);
    i += 1;
  } else {
    args.set(key, "true");
  }
}

const owner = args.get("owner") ?? DEFAULT_OWNER;
const repo = args.get("repo") ?? DEFAULT_REPO;
const listPath = args.get("list") ?? "tmp/semanticdiff/pr-list.json";
const outPath = args.get("out") ?? "tmp/semanticdiff/benchmark-summary.json";

const JsonUnknown = Schema.UnknownFromJsonString;
const decodeJson = (value, label) => {
  try {
    return Schema.decodeUnknownSync(JsonUnknown)(value);
  } catch (error) {
    throw new Error(
      `Failed to decode JSON${label ? ` (${label})` : ""}: ${String(error)}`
    );
  }
};
const encodeJson = (value) => Schema.encodeSync(JsonUnknown)(value);

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: script orchestration
async function runCompare(pr) {
  if (!bun) {
    throw new Error("This script requires Bun.");
  }
  const baseDir = `tmp/semanticdiff/pr-${pr}`;
  const manifestPath = `${baseDir}/manifest.json`;
  if (!existsSync(manifestPath)) {
    return { pr, status: "missing_semanticdiff" };
  }

  const proc = bun.spawn([
    "bun",
    "scripts/compare-semanticdiff-lines.mjs",
    "--owner",
    owner,
    "--repo",
    repo,
    "--pr",
    String(pr),
    "--dir",
    baseDir,
  ]);
  await proc.exited;
  if (proc.exitCode !== 0) {
    return { pr, status: "compare_failed", exitCode: proc.exitCode };
  }

  const compareJson = decodeJson(
    await bun.file(`${baseDir}/line-compare.json`).text(),
    `${baseDir}/line-compare.json`
  );
  let sdOld = 0;
  let sdNew = 0;
  let ourOld = 0;
  let ourNew = 0;
  let missingOld = 0;
  let missingNew = 0;
  let extraOld = 0;
  let extraNew = 0;
  let mismatchedFiles = 0;
  let ghOld = 0;
  let ghNew = 0;
  let ghMissingOld = 0;
  let ghMissingNew = 0;
  let ghExtraOld = 0;
  let ghExtraNew = 0;
  let ghFiles = 0;
  let ghSkippedFiles = 0;
  for (const row of compareJson) {
    if (row.skipped) {
      continue;
    }
    sdOld += Number(row.sdOld ?? 0);
    sdNew += Number(row.sdNew ?? 0);
    ourOld += Number(row.ourOld ?? 0);
    ourNew += Number(row.ourNew ?? 0);
    const mOld = Number(row.missingOld ?? 0);
    const mNew = Number(row.missingNew ?? 0);
    const eOld = Number(row.extraOld ?? 0);
    const eNew = Number(row.extraNew ?? 0);
    missingOld += mOld;
    missingNew += mNew;
    extraOld += eOld;
    extraNew += eNew;
    if (mOld + mNew + eOld + eNew > 0) {
      mismatchedFiles += 1;
    }
    if (row.ghSkipped) {
      ghSkippedFiles += 1;
      continue;
    }
    ghFiles += 1;
    ghOld += Number(row.ghOld ?? 0);
    ghNew += Number(row.ghNew ?? 0);
    ghMissingOld += Number(row.ghMissingOld ?? 0);
    ghMissingNew += Number(row.ghMissingNew ?? 0);
    ghExtraOld += Number(row.ghExtraOld ?? 0);
    ghExtraNew += Number(row.ghExtraNew ?? 0);
  }

  return {
    pr,
    status: "ok",
    sdOld,
    sdNew,
    ourOld,
    ourNew,
    missingOld,
    missingNew,
    extraOld,
    extraNew,
    mismatchedFiles,
    github: {
      skipped: ghFiles === 0,
      files: ghFiles,
      skippedFiles: ghSkippedFiles,
      ghOld,
      ghNew,
      missingOld: ghMissingOld,
      missingNew: ghMissingNew,
      extraOld: ghExtraOld,
      extraNew: ghExtraNew,
    },
  };
}

if (!bun) {
  throw new Error("This script requires Bun.");
}
const prList = decodeJson(await bun.file(listPath).text(), listPath);
const results = [];
for (const pr of prList) {
  // eslint-disable-next-line no-await-in-loop
  results.push(await runCompare(pr));
}

await bun.write(outPath, `${encodeJson(results)}\n`);
process.stdout.write(`Wrote ${outPath}\n`);
