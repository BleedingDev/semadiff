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

const registry = makeRegistry([
  ...swcParsers,
  ...treeSitterWasmParsers,
  ...lightningCssParsers,
]);

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const githubHeaders = token
  ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  : { Accept: "application/vnd.github+json" };

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

function addKey(map, key, count = 1) {
  map.set(key, (map.get(key) ?? 0) + count);
}

function addOldKey(map, line, text) {
  if (line == null) {
    return;
  }
  addKey(map, `${line}\t${text ?? ""}`);
}

function addNewKey(map, line, text) {
  if (line == null) {
    return;
  }
  addKey(map, `${line}\t${text ?? ""}`);
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
      addOldKey(oldKeys, oldLine, oldText);
      addNewKey(newKeys, newLine, newText);
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
      missingOldSamples: oldDiff.missing.slice(0, 3),
      extraOldSamples: oldDiff.extra.slice(0, 3),
      missingNewSamples: newDiff.missing.slice(0, 3),
      extraNewSamples: newDiff.extra.slice(0, 3),
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
      return { file: row.file, missing, extra };
    });
  await bun.write(SUMMARY_PATH, `${encodeJson(summary)}\n`);

  const worst = summary.filter((row) => row.missing > 0 || row.extra > 0);
  process.stdout.write(`Files with mismatches: ${worst.length}\n`);
  if (worst[0]) {
    process.stdout.write(`${encodeJson(worst.slice(0, 10))}\n`);
  }
}

await main();
