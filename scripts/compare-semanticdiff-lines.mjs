import { readFile } from "node:fs/promises";
import { Effect, Schema } from "effect";
import { defaultConfig, structuralDiff } from "../packages/core/src/index.js";
import { lightningCssParsers } from "../packages/parser-lightningcss/src/index.js";
import { swcParsers } from "../packages/parser-swc/src/index.js";
import { treeSitterWasmParsers } from "../packages/parser-tree-sitter-wasm/src/index.js";
import { makeRegistry } from "../packages/parsers/src/index.js";
import { renderHtml } from "../packages/render-html/src/index.ts";

const OWNER = "NMIT-WR";
const REPO = "new-engine";
const PR_NUMBER = 237;
const MANIFEST_PATH = "tmp/semanticdiff/pr-237/manifest.json";
const LINES_DIR = "tmp/semanticdiff/pr-237/lines";
const LINE_SPLIT_RE = /\r?\n/;
const PAYLOAD_RE = /__SEMADIFF_DATA__\s*=\s*(\{[\s\S]*?\});/;
const JSON_FILE_RE = /\.json$/;
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
const JsonStringify = Schema.parseJson(Schema.Unknown);

async function fetchJson(url) {
  const res = await fetch(url, { headers: githubHeaders });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${url}`);
  }
  return res.json();
}

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
  const json = await res.json();
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

function parseLinesTsv(tsv) {
  const lines = tsv.split(LINE_SPLIT_RE);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) {
      continue;
    }
    const cols = line.split("\t");
    if (cols.length < 6) {
      continue;
    }
    const [oldLineRaw, oldChange, oldText, newLineRaw, newChange, newText] =
      cols;
    const oldLine = oldLineRaw ? Number(oldLineRaw) : null;
    const newLine = newLineRaw ? Number(newLineRaw) : null;
    rows.push({
      oldLine: Number.isFinite(oldLine) ? oldLine : null,
      newLine: Number.isFinite(newLine) ? newLine : null,
      oldChange: oldChange?.trim() ?? "",
      newChange: newChange?.trim() ?? "",
      oldText: oldText ?? "",
      newText: newText ?? "",
    });
  }
  return rows;
}

function isSemanticDiffChanged(row) {
  return (
    row.oldChange.length > 0 ||
    row.newChange.length > 0 ||
    row.oldText !== row.newText
  );
}

function getPayloadRows(html) {
  const match = html.match(PAYLOAD_RE);
  if (!match) {
    return [];
  }
  const payload = Schema.decodeUnknownSync(JsonUnknown)(match[1]);
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const rows = payload.rows;
  return Array.isArray(rows) ? rows : [];
}

function addKey(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
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

function collectSideKeys(rows) {
  const oldKeys = new Map();
  const newKeys = new Map();
  for (const row of rows) {
    const oldLine = row.oldLine ?? null;
    const newLine = row.newLine ?? null;
    addOldKey(oldKeys, oldLine, row.oldText ?? "");
    addNewKey(newKeys, newLine, row.newText ?? "");
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

async function main() {
  if (!bun) {
    throw new Error("This script requires Bun.");
  }
  const manifest = await bun.file(MANIFEST_PATH).json();
  const pr = await fetchJson(
    `https://api.github.com/repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}`
  );
  const baseSha = pr.base.sha;
  const headSha = pr.head.sha;
  const encodeJson = (value) => Schema.encodeSync(JsonStringify)(value);

  const results = [];
  for (const entry of manifest) {
    const linesPath = `${LINES_DIR}/${entry.file.replace(JSON_FILE_RE, ".lines.tsv")}`;
    const linesTsv = await readFile(linesPath, "utf8");
    const sdRows = parseLinesTsv(linesTsv).filter(isSemanticDiffChanged);
    const sdKeys = collectSideKeys(sdRows);

    const { oldPath, newPath, oldOid, newOid } = parseDiffUrl(entry.diff);
    let oldText = await fetchText(
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/${baseSha}/${oldPath ?? entry.tracking_name}`
    );
    let newText = await fetchText(
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/${headSha}/${newPath ?? entry.tracking_name}`
    );
    if (oldText === null && oldOid) {
      oldText = await fetchBlob(oldOid);
    }
    if (newText === null && newOid) {
      newText = await fetchBlob(newOid);
    }
    if (oldText === null || newText === null) {
      results.push({
        file: entry.tracking_name,
        skipped: true,
        reason: "missing_content",
      });
      continue;
    }

    const oldParse = await Effect.runPromise(
      registry.parse({ content: oldText, path: oldPath ?? entry.tracking_name })
    );
    const newParse = await Effect.runPromise(
      registry.parse({ content: newText, path: newPath ?? entry.tracking_name })
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
      file: entry.tracking_name,
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

  await bun.write(
    "tmp/semanticdiff/pr-237/line-compare.json",
    `${encodeJson(results)}\n`
  );
  const summary = results.map((row) => {
    const missing = (row.missingOld ?? 0) + (row.missingNew ?? 0);
    const extra = (row.extraOld ?? 0) + (row.extraNew ?? 0);
    return { file: row.file, missing, extra };
  });
  await bun.write(
    "tmp/semanticdiff/pr-237/line-compare-summary.json",
    `${encodeJson(summary)}\n`
  );

  const worst = summary.filter((row) => row.missing > 0 || row.extra > 0);
  process.stdout.write(`Files with mismatches: ${worst.length}\n`);
  if (worst[0]) {
    process.stdout.write(`${encodeJson(worst.slice(0, 10))}\n`);
  }
}

await main();
