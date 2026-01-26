import { existsSync } from "node:fs";
import { Effect, Schema } from "effect";
import { defaultConfig, structuralDiff } from "../packages/core/src/index.js";
import { lightningCssParsers } from "../packages/parser-lightningcss/src/index.js";
import { swcParsers } from "../packages/parser-swc/src/index.js";
import { treeSitterWasmParsers } from "../packages/parser-tree-sitter-wasm/src/index.js";
import { makeRegistry } from "../packages/parsers/src/index.js";
import { renderHtml } from "../packages/render-html/src/index.ts";

const DEFAULT_OWNER = "NMIT-WR";
const DEFAULT_REPO = "new-engine";
const DEFAULT_PR = 237;
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

const OWNER = args.get("owner") ?? DEFAULT_OWNER;
const REPO = args.get("repo") ?? DEFAULT_REPO;
const PR_NUMBER = Number(args.get("pr") ?? DEFAULT_PR);
const BASE_DIR = args.get("dir") ?? `tmp/semanticdiff/pr-${PR_NUMBER}`;
const MANIFEST_PATH = args.get("manifest") ?? `${BASE_DIR}/manifest.json`;
const CONTROLLER_PATH = args.get("controller") ?? `${BASE_DIR}/controller.json`;
const DIFFS_DIR = args.get("diffs") ?? `${BASE_DIR}/diffs`;
const OUTPUT_PATH = args.get("out") ?? `${BASE_DIR}/line-compare.json`;
const SUMMARY_PATH =
  args.get("summary") ?? `${BASE_DIR}/line-compare-summary.json`;
const bun = globalThis.Bun;
const DIFF_HEADER_REGEX = /^diff --git a\/(.*?) b\/(.*)$/;
const HUNK_HEADER_REGEX = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const registry = makeRegistry([
  ...swcParsers,
  ...treeSitterWasmParsers,
  ...lightningCssParsers,
]);

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const githubHeaders = token
  ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  : { Accept: "application/vnd.github+json" };
const githubPatchHeaders = token
  ? { Authorization: `Bearer ${token}` }
  : undefined;

const JsonUnknown = Schema.parseJson(Schema.Unknown);

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

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    return null;
  }
  return res.text();
}

async function fetchGitHubDiff(prNumber) {
  const primary = `https://patch-diff.githubusercontent.com/raw/${OWNER}/${REPO}/pull/${prNumber}.diff`;
  const fallback = `https://github.com/${OWNER}/${REPO}/pull/${prNumber}.diff`;
  const res = await fetch(primary, { headers: githubPatchHeaders });
  if (res.ok) {
    return res.text();
  }
  const retry = await fetch(fallback, { headers: githubPatchHeaders });
  if (!retry.ok) {
    return null;
  }
  return retry.text();
}

async function fetchBlob(oid) {
  if (!oid) {
    return null;
  }
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/git/blobs/${oid}`,
    { headers: githubHeaders }
  );
  if (!res.ok) {
    return null;
  }
  const json = decodeJson(await res.text(), "blob");
  if (!json?.content) {
    return null;
  }
  const buff = Buffer.from(json.content.replace(/\n/g, ""), "base64");
  return buff.toString("utf8");
}

function parseDiffUrl(diffUrl) {
  const query = diffUrl.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  return {
    oldPath: params.get("old_filename"),
    newPath: params.get("new_filename"),
    oldOid: params.get("old_oid"),
    newOid: params.get("new_oid"),
  };
}

function stripGitPrefix(path) {
  if (!path) {
    return null;
  }
  if (path.startsWith("a/") || path.startsWith("b/")) {
    return path.slice(2);
  }
  return path;
}

function parseHunkHeader(line) {
  const match = HUNK_HEADER_REGEX.exec(line);
  if (!match) {
    return null;
  }
  return {
    oldStart: Number(match[1]),
    newStart: Number(match[3]),
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: diff parser
function parseGitHubDiff(diffText) {
  if (!diffText) {
    return [];
  }
  const files = [];
  let current = null;
  let oldLine = null;
  let newLine = null;

  const startFile = (oldPath, newPath) => {
    current = {
      oldPath,
      newPath,
      oldKeys: new Map(),
      newKeys: new Map(),
      hasHunks: false,
    };
    files.push(current);
    oldLine = null;
    newLine = null;
  };

  for (const line of diffText.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = DIFF_HEADER_REGEX.exec(line);
      if (match) {
        startFile(match[1], match[2]);
      } else {
        startFile(null, null);
      }
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith("--- ")) {
      const raw = line.slice(4).trim();
      current.oldPath = raw === "/dev/null" ? null : stripGitPrefix(raw);
      continue;
    }
    if (line.startsWith("+++ ")) {
      const raw = line.slice(4).trim();
      current.newPath = raw === "/dev/null" ? null : stripGitPrefix(raw);
      continue;
    }
    if (line.startsWith("@@ ")) {
      const hunk = parseHunkHeader(line);
      if (hunk) {
        current.hasHunks = true;
        oldLine = hunk.oldStart;
        newLine = hunk.newStart;
      }
      continue;
    }
    if (line === "\\ No newline at end of file") {
      continue;
    }
    if (oldLine == null || newLine == null) {
      continue;
    }
    if (line.startsWith("+")) {
      if (!line.startsWith("+++")) {
        addNewKey(current.newKeys, newLine, line.slice(1));
        newLine += 1;
      }
      continue;
    }
    if (line.startsWith("-")) {
      if (!line.startsWith("---")) {
        addOldKey(current.oldKeys, oldLine, line.slice(1));
        oldLine += 1;
      }
      continue;
    }
    if (line.startsWith(" ")) {
      oldLine += 1;
      newLine += 1;
    }
  }

  return files;
}

function buildGitHubIndex(files) {
  const map = new Map();
  for (const file of files) {
    if (!file) {
      continue;
    }
    const existing =
      (file.oldPath && map.get(file.oldPath)) ||
      (file.newPath && map.get(file.newPath)) ||
      null;
    const entry = existing ?? {
      oldPath: file.oldPath ?? null,
      newPath: file.newPath ?? null,
      oldKeys: new Map(),
      newKeys: new Map(),
      hasHunks: false,
    };
    if (file.oldPath) {
      entry.oldPath = entry.oldPath ?? file.oldPath;
      map.set(file.oldPath, entry);
    }
    if (file.newPath) {
      entry.newPath = entry.newPath ?? file.newPath;
      map.set(file.newPath, entry);
    }
    mergeKeyMaps(entry.oldKeys, file.oldKeys);
    mergeKeyMaps(entry.newKeys, file.newKeys);
    entry.hasHunks = entry.hasHunks || file.hasHunks;
  }
  return map;
}

function getPayloadRows(html) {
  const marker = "globalThis.__SEMADIFF_DATA__ = ";
  const start = html.indexOf(marker);
  if (start === -1) {
    return [];
  }
  const from = start + marker.length;
  const end = html.indexOf(";</script>", from);
  if (end === -1) {
    return [];
  }
  const jsonText = html.slice(from, end).trim();
  if (!jsonText) {
    return [];
  }
  const payload = decodeJson(jsonText, "semanticdiff-payload");
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const rows = payload.rows;
  return Array.isArray(rows) ? rows : [];
}

function addKey(map, key, count = 1, dedupe = false) {
  if (dedupe) {
    if (!map.has(key)) {
      map.set(key, 1);
    }
    return;
  }
  map.set(key, (map.get(key) ?? 0) + count);
}

function addOldKey(map, line, text, dedupe = false) {
  if (line == null) {
    return;
  }
  addKey(map, `${line}\t${text ?? ""}`, 1, dedupe);
}

function addNewKey(map, line, text, dedupe = false) {
  if (line == null) {
    return;
  }
  addKey(map, `${line}\t${text ?? ""}`, 1, dedupe);
}

function mergeKeyMaps(target, source) {
  for (const [key, count] of source.entries()) {
    addKey(target, key, count);
  }
}

function collectSdKeysFromDiffJson(diffJson) {
  if (!diffJson || diffJson.type === "error") {
    return null;
  }
  const blocks = diffJson.blocks;
  if (!Array.isArray(blocks)) {
    return null;
  }
  const oldKeys = new Map();
  const newKeys = new Map();
  for (const block of blocks) {
    const oldCol = block.old_column ?? [];
    const newCol = block.new_column ?? [];
    const len = Math.max(oldCol.length, newCol.length);
    for (let i = 0; i < len; i += 1) {
      const oldEntry = oldCol[i];
      const newEntry = newCol[i];
      const oldLine = oldEntry?.line ?? null;
      const newLine = newEntry?.line ?? null;
      const oldText = oldEntry?.content ?? "";
      const newText = newEntry?.content ?? "";
      const oldChange = oldEntry?.change ?? 0;
      const newChange = newEntry?.change ?? 0;
      const changed = oldChange !== 0 || newChange !== 0 || oldText !== newText;
      if (!changed) {
        continue;
      }
      addOldKey(oldKeys, oldLine, oldText, true);
      addNewKey(newKeys, newLine, newText, true);
    }
  }
  return { oldKeys, newKeys };
}

function collectOurSideKeys(rows) {
  const oldKeys = new Map();
  const newKeys = new Map();
  for (const row of rows) {
    if (!row || typeof row.type !== "string") {
      continue;
    }
    switch (row.type) {
      case "delete": {
        addOldKey(oldKeys, row.oldLine ?? null, row.text ?? "");
        break;
      }
      case "insert": {
        addNewKey(newKeys, row.newLine ?? null, row.text ?? "");
        break;
      }
      case "replace": {
        addOldKey(oldKeys, row.oldLine ?? null, row.oldText ?? "");
        addNewKey(newKeys, row.newLine ?? null, row.newText ?? "");
        break;
      }
      case "move": {
        addOldKey(oldKeys, row.oldLine ?? null, row.oldText ?? row.text ?? "");
        addNewKey(newKeys, row.newLine ?? null, row.newText ?? row.text ?? "");
        break;
      }
      default: {
        break;
      }
    }
  }
  return { oldKeys, newKeys };
}

function diffKeyMaps(expected, actual) {
  const missing = [];
  const extra = [];
  for (const [key, count] of expected.entries()) {
    const actualCount = actual.get(key) ?? 0;
    if (actualCount < count) {
      missing.push({ key, count: count - actualCount });
    }
  }
  for (const [key, count] of actual.entries()) {
    const expectedCount = expected.get(key) ?? 0;
    if (count > expectedCount) {
      extra.push({ key, count: count - expectedCount });
    }
  }
  return { missing, extra };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: script orchestration
async function main() {
  if (!bun) {
    throw new Error("This script requires Bun.");
  }
  const manifestRaw = decodeJson(
    await bun.file(MANIFEST_PATH).text(),
    MANIFEST_PATH
  );
  const manifest = Array.isArray(manifestRaw) ? manifestRaw : [];
  const controller = decodeJson(
    await bun.file(CONTROLLER_PATH).text(),
    CONTROLLER_PATH
  );
  const baseSha = controller?.diffInfo?.baseCommit;
  const headSha = controller?.diffInfo?.headCommit;
  if (!(baseSha && headSha)) {
    throw new Error(
      `Missing base/head commit from ${CONTROLLER_PATH}. Re-cache SemanticDiff data.`
    );
  }

  const githubDiffPath = args.get("githubDiff") ?? `${BASE_DIR}/github.diff`;
  let githubDiffText = null;
  if (existsSync(githubDiffPath)) {
    githubDiffText = await bun.file(githubDiffPath).text();
  } else {
    githubDiffText = await fetchGitHubDiff(PR_NUMBER);
    if (githubDiffText) {
      await bun.write(githubDiffPath, githubDiffText);
    }
  }
  const githubFiles = parseGitHubDiff(githubDiffText);
  const githubIndex = buildGitHubIndex(githubFiles);

  const entriesByFile = new Map();
  for (const entry of manifest) {
    if (!(entry?.tracking_name && entry?.file && entry?.diff)) {
      continue;
    }
    const record = entriesByFile.get(entry.tracking_name) ?? {
      trackingName: entry.tracking_name,
      files: [],
      oldPath: null,
      newPath: null,
      oldOid: null,
      newOid: null,
    };
    record.files.push(entry.file);
    const parsed = parseDiffUrl(entry.diff);
    if (parsed.oldPath && !record.oldPath) {
      record.oldPath = parsed.oldPath;
    }
    if (parsed.newPath && !record.newPath) {
      record.newPath = parsed.newPath;
    }
    if (parsed.oldOid && !record.oldOid) {
      record.oldOid = parsed.oldOid;
    }
    if (parsed.newOid && !record.newOid) {
      record.newOid = parsed.newOid;
    }
    entriesByFile.set(entry.tracking_name, record);
  }

  const results = [];
  for (const entry of entriesByFile.values()) {
    const sdKeys = { oldKeys: new Map(), newKeys: new Map() };
    let sdError = null;
    let sdOk = false;
    for (const diffFile of entry.files) {
      try {
        const diffPath = `${DIFFS_DIR}/${diffFile}`;
        const diffJson = decodeJson(await bun.file(diffPath).text(), diffPath);
        if (diffJson?.type === "error") {
          sdError = diffJson.error ?? diffJson;
          continue;
        }
        const keys = collectSdKeysFromDiffJson(diffJson);
        if (keys) {
          mergeKeyMaps(sdKeys.oldKeys, keys.oldKeys);
          mergeKeyMaps(sdKeys.newKeys, keys.newKeys);
          sdOk = true;
        }
      } catch (error) {
        sdError = { type: "read_error", message: String(error) };
      }
    }

    if (!sdOk) {
      results.push({
        file: entry.trackingName,
        skipped: true,
        reason: "sd_error",
        sdError,
      });
      continue;
    }

    const oldPath = entry.oldPath ?? entry.trackingName;
    const newPath = entry.newPath ?? entry.trackingName;
    const oldOid = entry.oldOid;
    const newOid = entry.newOid;
    let oldText = await fetchText(
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/${baseSha}/${oldPath}`
    );
    let newText = await fetchText(
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/${headSha}/${newPath}`
    );
    if (oldText === null && oldOid) {
      oldText = await fetchBlob(oldOid);
    }
    if (newText === null && newOid) {
      newText = await fetchBlob(newOid);
    }
    if (oldText === null || newText === null) {
      results.push({
        file: entry.trackingName,
        skipped: true,
        reason: "missing_content",
      });
      continue;
    }

    const oldParse = await Effect.runPromise(
      registry.parse({ content: oldText, path: oldPath })
    );
    const newParse = await Effect.runPromise(
      registry.parse({ content: newText, path: newPath })
    );
    const language =
      newParse.language !== "text" ? newParse.language : oldParse.language;

    const diff = structuralDiff(oldText, newText, {
      normalizers: defaultConfig.normalizers,
      language,
      oldRoot: oldParse.root,
      newRoot: newParse.root,
      oldTokens: oldParse.tokens,
      newTokens: newParse.tokens,
      detectMoves: true,
    });

    const html = renderHtml(diff, {
      oldText,
      newText,
      language,
      filePath: entry.trackingName ?? oldPath ?? newPath ?? undefined,
      view: "lines",
      lineMode: "semantic",
      contextLines: 0,
      lineLayout: "split",
      showBanner: false,
      showSummary: false,
      showFilePath: false,
      layout: "embed",
      virtualize: true,
      batchSize: 5000,
    });
    const ourRows = getPayloadRows(html);
    const ourKeys = collectOurSideKeys(ourRows);

    const oldDiff = diffKeyMaps(sdKeys.oldKeys, ourKeys.oldKeys);
    const newDiff = diffKeyMaps(sdKeys.newKeys, ourKeys.newKeys);

    const ghEntry =
      githubIndex.get(entry.trackingName) ??
      githubIndex.get(oldPath) ??
      githubIndex.get(newPath);
    const ghSkipped = !ghEntry?.hasHunks;
    const ghOldKeys = ghSkipped ? null : ghEntry.oldKeys;
    const ghNewKeys = ghSkipped ? null : ghEntry.newKeys;
    const ghOldDiff = ghOldKeys
      ? diffKeyMaps(ghOldKeys, ourKeys.oldKeys)
      : { missing: [], extra: [] };
    const ghNewDiff = ghNewKeys
      ? diffKeyMaps(ghNewKeys, ourKeys.newKeys)
      : { missing: [], extra: [] };

    results.push({
      file: entry.trackingName,
      sdOld: sdKeys.oldKeys.size,
      sdNew: sdKeys.newKeys.size,
      ourOld: ourKeys.oldKeys.size,
      ourNew: ourKeys.newKeys.size,
      missingOld: oldDiff.missing.length,
      extraOld: oldDiff.extra.length,
      missingNew: newDiff.missing.length,
      extraNew: newDiff.extra.length,
      ghOld: ghOldKeys ? ghOldKeys.size : 0,
      ghNew: ghNewKeys ? ghNewKeys.size : 0,
      ghMissingOld: ghOldDiff.missing.length,
      ghExtraOld: ghOldDiff.extra.length,
      ghMissingNew: ghNewDiff.missing.length,
      ghExtraNew: ghNewDiff.extra.length,
      ghSkipped,
      missingOldSamples: oldDiff.missing.slice(0, 3),
      extraOldSamples: oldDiff.extra.slice(0, 3),
      missingNewSamples: newDiff.missing.slice(0, 3),
      extraNewSamples: newDiff.extra.slice(0, 3),
      ghMissingOldSamples: ghOldDiff.missing.slice(0, 3),
      ghExtraOldSamples: ghOldDiff.extra.slice(0, 3),
      ghMissingNewSamples: ghNewDiff.missing.slice(0, 3),
      ghExtraNewSamples: ghNewDiff.extra.slice(0, 3),
    });
  }

  results.sort((a, b) => {
    const aMissing = (a.missingOld ?? 0) + (a.missingNew ?? 0);
    const bMissing = (b.missingOld ?? 0) + (b.missingNew ?? 0);
    return bMissing - aMissing;
  });

  await bun.write(OUTPUT_PATH, `${encodeJson(results)}\n`);
  const summary = results
    .filter((row) => !row.skipped)
    .map((row) => {
      const missing = (row.missingOld ?? 0) + (row.missingNew ?? 0);
      const extra = (row.extraOld ?? 0) + (row.extraNew ?? 0);
      const ghMissing = (row.ghMissingOld ?? 0) + (row.ghMissingNew ?? 0);
      const ghExtra = (row.ghExtraOld ?? 0) + (row.ghExtraNew ?? 0);
      return {
        file: row.file,
        missing,
        extra,
        ghMissing,
        ghExtra,
        ghSkipped: Boolean(row.ghSkipped),
      };
    });
  await bun.write(SUMMARY_PATH, `${encodeJson(summary)}\n`);

  const worst = summary.filter((row) => row.missing > 0 || row.extra > 0);
  process.stdout.write(`Files with mismatches: ${worst.length}\n`);
  if (worst[0]) {
    process.stdout.write(`${encodeJson(worst.slice(0, 10))}\n`);
  }
}

await main();
