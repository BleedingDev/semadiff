import type { DiffDocument } from "@semadiff/core";
import {
  createDiagnosticsBundle,
  DiagnosticsBundleSchema,
  defaultConfig,
  structuralDiff,
} from "@semadiff/core";
import { renderHtml } from "@semadiff/render-html";
import "./content.css";
import { treeSitterWasmParsers } from "@semadiff/parser-tree-sitter-wasm";
import { makeRegistry } from "@semadiff/parsers";
import { Effect, Schema } from "effect";
import type { BlobResult } from "./blob";
import { fetchBlob } from "./blob";
import { logger } from "./logger";

const STORAGE_KEY = "semadiff-overlay-open";
const TELEMETRY_KEY = "semadiff-telemetry";
const TELEMETRY_EXPORTER_KEY = "semadiff-telemetry-exporter";
const TELEMETRY_ENDPOINT_KEY = "semadiff-telemetry-endpoint";
const FULL_REPLACE_KEY = "semadiff-full-replace";
const DIRECT_API_KEY = "semadiff-direct-api";
const parserRegistry = makeRegistry(treeSitterWasmParsers);
const TelemetryPayloadSchema = Schema.Struct({
  span: Schema.String,
  timestamp: Schema.String,
  attributes: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});
const OtlpAttributeSchema = Schema.Struct({
  key: Schema.String,
  value: Schema.Struct({ stringValue: Schema.String }),
});
const OtlpSpanSchema = Schema.Struct({
  name: Schema.String,
  startTimeUnixNano: Schema.String,
  endTimeUnixNano: Schema.String,
  attributes: Schema.Array(OtlpAttributeSchema),
});
const OtlpScopeSchema = Schema.Struct({
  scope: Schema.Struct({ name: Schema.String }),
  spans: Schema.Array(OtlpSpanSchema),
});
const OtlpResourceSchema = Schema.Struct({
  resource: Schema.Struct({ attributes: Schema.Array(OtlpAttributeSchema) }),
  scopeSpans: Schema.Array(OtlpScopeSchema),
});
const OtlpPayloadSchema = Schema.Struct({
  resourceSpans: Schema.Array(OtlpResourceSchema),
});
const TelemetryPayloadJson = Schema.parseJson(TelemetryPayloadSchema);
const OtlpPayloadJson = Schema.parseJson(OtlpPayloadSchema);
const DiagnosticsBundleJson = Schema.parseJson(DiagnosticsBundleSchema, {
  space: 2,
});
function getFallbackStorage() {
  const store = (
    globalThis as { __semadiffSessionStorage?: Record<string, string> }
  ).__semadiffSessionStorage;
  return store && typeof store === "object" ? store : null;
}

function readSessionStorage(key: string) {
  try {
    const value = sessionStorage.getItem(key);
    if (value !== null) {
      return value;
    }
  } catch {
    // Fall back to in-memory storage when sessionStorage is unavailable.
  }
  const fallback = getFallbackStorage();
  return fallback?.[key] ?? null;
}

function writeSessionStorage(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    const fallback = getFallbackStorage();
    if (fallback) {
      fallback[key] = value;
    }
  }
}

function isDirectApiEnabled() {
  return (
    readSessionStorage(DIRECT_API_KEY) === "true" ||
    document.documentElement.dataset.semadiffDirectApi === "true"
  );
}

function getCsrfToken() {
  return (
    document
      .querySelector<HTMLMetaElement>("meta[name='csrf-token']")
      ?.getAttribute("content") ?? null
  );
}

function buildHeaders() {
  const token = getCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

function appendIfMissing(formData: FormData, key: string, value?: string) {
  if (!value || formData.has(key)) {
    return;
  }
  formData.set(key, value);
}

function emitDebugRequest(
  url: string,
  formData: FormData,
  headers: Record<string, string>
) {
  if (document.documentElement.dataset.semadiffDebug !== "true") {
    return;
  }
  const entries: [string, string][] = [];
  formData.forEach((value, key) => {
    entries.push([String(key), String(value)]);
  });
  const detail = {
    url,
    headers,
    bodyEntries: entries,
  };
  window.dispatchEvent(new CustomEvent("semadiff-debug-request", { detail }));
}

function getFormAction(form?: HTMLFormElement | null) {
  if (!form) {
    return "";
  }
  return form.getAttribute("action") ?? form.action ?? "";
}

function extractDataAttribute(
  elements: Array<HTMLElement | null | undefined>,
  attribute: string
) {
  for (const element of elements) {
    if (!element) {
      continue;
    }
    const value = element.getAttribute(attribute);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function extractLineMeta(params: {
  fileNode: HTMLElement;
  lineNode?: HTMLElement | null;
  actionNode?: HTMLElement | null;
  fallbackLine: number | undefined;
}) {
  const { fileNode, lineNode, actionNode, fallbackLine } = params;
  const sources = [actionNode, lineNode, fileNode];
  return {
    lineNumber:
      extractDataAttribute(sources, "data-line-number") ??
      (fallbackLine ? String(fallbackLine) : undefined),
    position: extractDataAttribute(sources, "data-position"),
    side: extractDataAttribute(sources, "data-side"),
    commitId: extractDataAttribute(sources, "data-commit-id"),
    apiUrl:
      extractDataAttribute(sources, "data-api-url") ??
      extractDataAttribute(sources, "data-comment-url"),
    resolveUrl:
      extractDataAttribute(sources, "data-resolve-url") ??
      extractDataAttribute(sources, "data-thread-url"),
  };
}

async function submitFormAction(params: {
  url: string;
  form?: HTMLFormElement | null;
  bodyOverrides?: Record<string, string | undefined>;
}) {
  const { url, form, bodyOverrides } = params;
  const formData = form ? new FormData(form) : new FormData();
  if (bodyOverrides) {
    for (const [key, value] of Object.entries(bodyOverrides)) {
      appendIfMissing(formData, key, value);
    }
  }
  const headers = buildHeaders();
  emitDebugRequest(url, formData, headers);
  const response = await fetch(url, {
    method: form?.method?.toUpperCase() || "POST",
    body: formData,
    headers,
    credentials: "include",
    redirect: "follow",
  });
  return response;
}

function telemetrySpan(name: string, attributes: Record<string, unknown>) {
  const enabled = readSessionStorage(TELEMETRY_KEY) === "true";
  if (!enabled) {
    return;
  }
  const exporter = readSessionStorage(TELEMETRY_EXPORTER_KEY) ?? "console";
  const timestamp = new Date().toISOString();
  if (exporter === "console") {
    const payload = {
      span: name,
      timestamp,
      attributes,
    };
    logger.info(Schema.encodeSync(TelemetryPayloadJson)(payload));
    return;
  }
  const endpoint = readSessionStorage(TELEMETRY_ENDPOINT_KEY);
  if (!endpoint || typeof fetch !== "function") {
    return;
  }
  const nowNs = String(Date.now() * 1_000_000);
  const body = buildOtlpSpanPayload(name, nowNs, nowNs, attributes);
  fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: Schema.encodeSync(OtlpPayloadJson)(body),
  }).catch(() => undefined);
}

function buildOtlpSpanPayload(
  name: string,
  startTimeUnixNano: string,
  endTimeUnixNano: string,
  attributes: Record<string, unknown>
) {
  const otelAttributes = Object.entries(attributes).map(([key, value]) => ({
    key,
    value: { stringValue: String(value) },
  }));
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: "semadiff-extension" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "semadiff-extension" },
            spans: [
              {
                name,
                startTimeUnixNano,
                endTimeUnixNano,
                attributes: otelAttributes,
              },
            ],
          },
        ],
      },
    ],
  };
}

function collectFilePaths(): string[] {
  const files = Array.from(document.querySelectorAll<HTMLElement>("div.file"));
  return files
    .map((file) => file.getAttribute("data-path"))
    .filter((path): path is string => Boolean(path));
}

let lastDiff: DiffDocument | null = null;

function emptyDiff(): DiffDocument {
  return {
    version: "0.1.0",
    operations: [],
    moves: [],
    renames: [],
  };
}

function reportBlobError(
  errorNode: HTMLElement,
  path: string,
  message: string
) {
  errorNode.textContent = `Error: ${message}`;
  telemetrySpan("fetchBlobs", { status: "error", path, error: message });
}

function resolveBlobContents(
  baseResult: BlobResult,
  headResult: BlobResult,
  errorNode: HTMLElement,
  path: string
) {
  if (!baseResult.ok) {
    reportBlobError(errorNode, path, baseResult.error);
    return null;
  }
  if (!headResult.ok) {
    reportBlobError(errorNode, path, headResult.error);
    return null;
  }
  return {
    baseContent: baseResult.content,
    headContent: headResult.content,
  };
}

type LineTarget =
  | { status: "mapped"; line: number; source: "new" | "old" }
  | { status: "unmappable"; reason: string };

function isValidLine(line?: number | null): line is number {
  return Boolean(line && Number.isFinite(line) && line > 0);
}

function resolveDiffLineTarget(diff: DiffDocument): LineTarget {
  const newLine = diff.operations.find((op) => op.newRange?.start.line)
    ?.newRange?.start.line;
  if (isValidLine(newLine)) {
    return { status: "mapped", line: newLine, source: "new" };
  }
  const oldLine = diff.operations.find((op) => op.oldRange?.start.line)
    ?.oldRange?.start.line;
  if (isValidLine(oldLine)) {
    return { status: "mapped", line: oldLine, source: "old" };
  }
  if (diff.operations.length === 0) {
    return { status: "unmappable", reason: "no-operations" };
  }
  return { status: "unmappable", reason: "missing-line-range" };
}

function setLineTarget(container: HTMLElement, target: LineTarget) {
  container.dataset.lineStatus = target.status;
  if (target.status === "mapped") {
    container.dataset.line = String(target.line);
    container.dataset.lineSource = target.source;
    delete container.dataset.lineReason;
    return;
  }
  delete container.dataset.line;
  delete container.dataset.lineSource;
  container.dataset.lineReason = target.reason;
}

function getMappedLine(container: HTMLElement): number | null {
  if (container.dataset.lineStatus !== "mapped") {
    return null;
  }
  const parsed = Number.parseInt(container.dataset.line ?? "", 10);
  return isValidLine(parsed) ? parsed : null;
}

const LINE_SPLIT_RE = /\r?\n/;

function countLines(text?: string) {
  if (!text) {
    return 0;
  }
  return text.split(LINE_SPLIT_RE).length;
}

function estimateReduction(diff: DiffDocument) {
  const operations = diff.operations.length;
  const changeLines = diff.operations.reduce((total, op) => {
    return total + countLines(op.oldText) + countLines(op.newText);
  }, 0);
  if (operations === 0 || changeLines === 0) {
    return { percent: 0, operations, changeLines };
  }
  const ratio = 1 - operations / changeLines;
  const clamped = Math.max(0, Math.min(1, ratio));
  return {
    percent: Math.round(clamped * 100),
    operations,
    changeLines,
  };
}

function renderDiffResult(params: {
  diff: DiffDocument;
  container: HTMLElement;
  diffSlot: HTMLElement;
  statusText: HTMLElement;
  statusMeta: HTMLElement;
  barFill: HTMLElement;
  metricValue: HTMLElement;
  aggregate: { operations: number; changeLines: number };
  oldText: string;
  newText: string;
  button: HTMLButtonElement;
  fileNode: HTMLElement | null;
  path: string;
}) {
  const {
    diff,
    container,
    diffSlot,
    statusText,
    statusMeta,
    barFill,
    metricValue,
    aggregate,
    oldText,
    newText,
    button,
    fileNode,
    path,
  } = params;
  const lineTarget = resolveDiffLineTarget(diff);
  setLineTarget(container, lineTarget);
  const reduction = estimateReduction(diff);
  statusText.textContent = `${reduction.percent}% smaller`;
  statusMeta.textContent = `${reduction.operations} ops · ${reduction.changeLines} touched lines`;
  barFill.style.width = `${reduction.percent}%`;
  aggregate.operations += reduction.operations;
  aggregate.changeLines += reduction.changeLines;
  const overallPercent =
    aggregate.operations === 0 || aggregate.changeLines === 0
      ? 0
      : Math.round(
          Math.max(
            0,
            Math.min(1, 1 - aggregate.operations / aggregate.changeLines)
          ) * 100
        );
  metricValue.textContent = `${overallPercent}%`;
  const html = renderHtml(diff, {
    maxOperations: 50,
    virtualize: true,
    filePath: path,
    view: "lines",
    lineMode: "semantic",
    oldText,
    newText,
    contextLines: 3,
  });
  const iframe = document.createElement("iframe");
  iframe.srcdoc = html;
  diffSlot.appendChild(iframe);
  container.dataset.loaded = "true";
  button.textContent = "Loaded";
  button.disabled = true;
  telemetrySpan("render", { path });

  const fullReplaceEnabled = readSessionStorage(FULL_REPLACE_KEY) === "true";
  if (fullReplaceEnabled && fileNode) {
    const replacement = document.createElement("div");
    replacement.className = "semadiff-replace";
    const replaceFrame = document.createElement("iframe");
    replaceFrame.srcdoc = html;
    replacement.appendChild(replaceFrame);
    fileNode.insertAdjacentElement("beforebegin", replacement);
    fileNode.dataset.semadiffHidden = "true";
    fileNode.style.display = "none";
  }
}

async function loadDiffForFile(params: {
  baseResult: BlobResult;
  headResult: BlobResult;
  path: string;
  container: HTMLElement;
  diffSlot: HTMLElement;
  errorNode: HTMLElement;
  statusText: HTMLElement;
  statusMeta: HTMLElement;
  barFill: HTMLElement;
  metricValue: HTMLElement;
  aggregate: { operations: number; changeLines: number };
  button: HTMLButtonElement;
  fileNode: HTMLElement | null;
}) {
  const {
    baseResult,
    headResult,
    path,
    container,
    diffSlot,
    errorNode,
    statusText,
    statusMeta,
    barFill,
    metricValue,
    aggregate,
    button,
    fileNode,
  } = params;
  const contents = resolveBlobContents(baseResult, headResult, errorNode, path);
  if (!contents) {
    return;
  }

  telemetrySpan("parse", { path });
  const [parsedBase, parsedHead] = await Promise.all([
    Effect.runPromise(
      parserRegistry.parse({ content: contents.baseContent, path })
    ),
    Effect.runPromise(
      parserRegistry.parse({ content: contents.headContent, path })
    ),
  ]);
  const language =
    parsedHead.language !== "text" ? parsedHead.language : parsedBase.language;
  telemetrySpan("diff", { path, language });
  const diff = structuralDiff(contents.baseContent, contents.headContent, {
    normalizers: defaultConfig.normalizers,
    language,
    oldRoot: parsedBase.root,
    newRoot: parsedHead.root,
    ...(parsedBase.tokens !== undefined
      ? { oldTokens: parsedBase.tokens }
      : {}),
    ...(parsedHead.tokens !== undefined
      ? { newTokens: parsedHead.tokens }
      : {}),
  });
  lastDiff = diff;
  renderDiffResult({
    diff,
    container,
    diffSlot,
    statusText,
    statusMeta,
    barFill,
    metricValue,
    aggregate,
    oldText: contents.baseContent,
    newText: contents.headContent,
    button,
    fileNode,
    path,
  });
}

function mountOverlay() {
  if (document.getElementById("semadiff-overlay")) {
    return;
  }

  const toggle = document.createElement("button");
  toggle.id = "semadiff-toggle";
  toggle.textContent = "SemaDiff";

  const overlay = document.createElement("div");
  overlay.id = "semadiff-overlay";
  overlay.dataset.open = "false";

  const shell = document.createElement("div");
  shell.className = "sd-shell";

  const header = document.createElement("div");
  header.className = "sd-header";
  const banner = document.createElement("div");
  banner.className = "sd-banner";
  const brand = document.createElement("div");
  brand.className = "sd-brand";
  brand.append(document.createTextNode("Review changes with "));
  const badge = document.createElement("span");
  badge.className = "sd-badge";
  badge.textContent = "SemaDiff";
  brand.append(badge);
  const metric = document.createElement("div");
  metric.className = "sd-metric";
  metric.title = "Estimated vs raw line changes";
  const metricValue = document.createElement("span");
  metricValue.className = "sd-metric-value";
  metricValue.textContent = "0%";
  const metricLabel = document.createElement("span");
  metricLabel.className = "sd-metric-label";
  metricLabel.textContent = "smaller";
  metric.append(metricValue, metricLabel);
  banner.append(brand, metric);

  const actions = document.createElement("div");
  actions.className = "sd-controls";
  const report = document.createElement("button");
  report.className = "sd-button sd-button--ghost";
  report.textContent = "Report bug";
  report.addEventListener("click", async () => {
    // biome-ignore lint/suspicious/noAlert: native confirm provides simple opt-in for diagnostics.
    const includeCode = window.confirm(
      "Include code snippets in diagnostics? (Default is metadata-only)"
    );
    const diagnostics = createDiagnosticsBundle({
      diff: lastDiff ?? emptyDiff(),
      includeCode,
    });
    const body = `Diagnostics:\\n\\n${Schema.encodeSync(DiagnosticsBundleJson)(
      diagnostics
    )}`;
    try {
      await navigator.clipboard.writeText(body);
      // biome-ignore lint/suspicious/noAlert: native alert provides immediate feedback.
      window.alert("Diagnostics copied to clipboard.");
    } catch {
      // biome-ignore lint/suspicious/noAlert: native alert provides immediate feedback.
      window.alert("Unable to copy diagnostics to clipboard.");
    }
    const issueUrl = `https://github.com/semadiff/semadiff/issues/new?title=${encodeURIComponent(
      "SemaDiff overlay issue"
    )}&body=${encodeURIComponent(body)}`;
    window.open(issueUrl, "_blank", "noopener");
  });
  const close = document.createElement("button");
  close.className = "sd-button";
  close.textContent = "Close";
  close.addEventListener("click", () => setOverlayOpen(false));
  actions.append(report, close);
  header.append(banner, actions);

  const list = document.createElement("div");
  list.className = "sd-table";
  const files = collectFilePaths();
  const aggregate = { operations: 0, changeLines: 0 };
  if (files.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sd-empty";
    empty.textContent = "No changed files detected.";
    list.appendChild(empty);
  } else {
    const headRow = document.createElement("div");
    headRow.className = "sd-row sd-row--head";
    const headFile = document.createElement("div");
    headFile.textContent = "File";
    const headStatus = document.createElement("div");
    headStatus.textContent = "Status";
    const headActions = document.createElement("div");
    headActions.textContent = "Actions";
    headRow.append(headFile, headStatus, headActions);
    list.appendChild(headRow);
  }
  for (const path of files) {
    const container = document.createElement("div");
    container.className = "sd-file";
    const row = document.createElement("div");
    row.className = "sd-row";
    const name = document.createElement("div");
    name.className = "sd-file-name";
    name.textContent = path;

    const status = document.createElement("div");
    status.className = "sd-status";
    const bar = document.createElement("div");
    bar.className = "sd-bar";
    const barFill = document.createElement("div");
    barFill.className = "sd-bar-fill";
    bar.append(barFill);
    const statusText = document.createElement("div");
    statusText.className = "sd-status-text";
    statusText.textContent = "Not loaded";
    const statusMeta = document.createElement("div");
    statusMeta.className = "sd-status-meta";
    statusMeta.textContent = "—";
    status.append(bar, statusText, statusMeta);

    const actionsRow = document.createElement("div");
    actionsRow.className = "sd-actions";

    const diffSlot = document.createElement("div");
    diffSlot.className = "sd-diff-slot";
    const button = document.createElement("button");
    button.textContent = "Load diff";
    button.addEventListener("click", () => {
      if (container.querySelector("iframe")) {
        return;
      }
      statusText.textContent = "Loading…";
      statusMeta.textContent = "Fetching blobs";
      const fileNode = document.querySelector<HTMLElement>(
        `div.file[data-path='${path}']`
      );
      const baseUrl = fileNode?.dataset.baseBlobUrl;
      const headUrl =
        fileNode?.dataset.headBlobUrl ?? fileNode?.dataset.blobUrl;
      if (!(baseUrl || headUrl)) {
        statusText.textContent = "Error: Missing blob URLs";
        statusMeta.textContent = "Unable to load diff.";
        telemetrySpan("fetchBlobs", {
          status: "error",
          path,
          error: "Missing blob URLs",
        });
        return;
      }

      const emptyResult: BlobResult = { ok: true, content: "" };
      const basePromise = baseUrl
        ? fetchBlob(baseUrl)
        : Promise.resolve(emptyResult);
      const headPromise = headUrl
        ? fetchBlob(headUrl)
        : Promise.resolve(emptyResult);

      Promise.all([basePromise, headPromise]).then(([baseResult, headResult]) =>
        loadDiffForFile({
          baseResult,
          headResult,
          path,
          container,
          diffSlot,
          errorNode: statusText,
          statusText,
          statusMeta,
          barFill,
          metricValue,
          aggregate,
          button,
          fileNode,
        })
      );
    });
    const jump = document.createElement("button");
    jump.textContent = "Jump";
    jump.addEventListener("click", () => {
      const line = getMappedLine(container);
      if (!line) {
        // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
        window.alert("No mapped line available. Jumping to file header.");
        jumpToFile(path);
        return;
      }
      jumpToFile(path, line);
    });

    const comment = document.createElement("button");
    comment.textContent = "Comment";
    comment.addEventListener("click", () => {
      const line = getMappedLine(container);
      if (!line) {
        // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
        window.alert("No mapped line available for comments.");
        return;
      }
      if (isDirectApiEnabled()) {
        createCommentViaApi(path, line);
      } else {
        openCommentUi(path, line);
      }
    });

    const resolve = document.createElement("button");
    resolve.textContent = "Resolve";
    resolve.addEventListener("click", () => {
      const line = getMappedLine(container);
      if (!line) {
        // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
        window.alert("No mapped line available to resolve.");
        return;
      }
      if (isDirectApiEnabled()) {
        resolveThreadViaApi(path, line);
      } else {
        resolveThread(path, line);
      }
    });

    actionsRow.append(button, jump, comment, resolve);
    row.append(name, status, actionsRow);
    container.append(row, diffSlot);
    list.appendChild(container);
  }

  shell.append(header, list);
  overlay.append(shell);
  document.body.append(toggle, overlay);

  toggle.addEventListener("click", () => {
    setOverlayOpen(overlay.dataset.open !== "true");
  });

  const isOpen = readSessionStorage(STORAGE_KEY) === "true";
  setOverlayOpen(isOpen);

  function setOverlayOpen(open: boolean) {
    overlay.dataset.open = open ? "true" : "false";
    writeSessionStorage(STORAGE_KEY, open ? "true" : "false");
    if (open) {
      telemetrySpan("overlayOpen", { fileCount: files.length });
    }
  }

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "d" && event.shiftKey && event.ctrlKey) {
      setOverlayOpen(overlay.dataset.open !== "true");
    }
  });
}

function jumpToFile(path: string, line?: number) {
  const fileNode = document.querySelector<HTMLElement>(
    `div.file[data-path='${path}']`
  );
  if (!fileNode) {
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert("Unable to locate file in GitHub diff.");
    return;
  }
  const lineNode = findLineNode(fileNode, line);
  if (lineNode) {
    lineNode.scrollIntoView({ behavior: "smooth", block: "center" });
    lineNode.classList.add("semadiff-highlight");
    setTimeout(() => lineNode.classList.remove("semadiff-highlight"), 2000);
    return;
  }
  fileNode.scrollIntoView({ behavior: "smooth", block: "start" });
  fileNode.classList.add("semadiff-highlight");
  setTimeout(() => fileNode.classList.remove("semadiff-highlight"), 2000);
}

function openCommentUi(path: string, line?: number) {
  if (!isValidLine(line)) {
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert("Unable to map a line for this comment.");
    return;
  }
  const fileNode = document.querySelector<HTMLElement>(
    `div.file[data-path='${path}']`
  );
  const lineNode = fileNode ? findLineNode(fileNode, line) : null;
  const commentButton =
    lineNode?.querySelector<HTMLElement>(".js-add-line-comment") ?? null;
  if (!commentButton) {
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert("Unable to open comment UI for the mapped line.");
    return;
  }
  commentButton.click();
}

function resolveThread(path: string, line?: number) {
  if (!isValidLine(line)) {
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert("Unable to map a line for this resolution.");
    return;
  }
  const fileNode = document.querySelector<HTMLElement>(
    `div.file[data-path='${path}']`
  );
  const lineNode = fileNode ? findLineNode(fileNode, line) : null;
  const resolveButton =
    lineNode?.querySelector<HTMLElement>(".js-resolve-thread") ?? null;
  if (!resolveButton) {
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert("Unable to resolve thread for the mapped line.");
    return;
  }
  resolveButton.click();
}

async function createCommentViaApi(path: string, line?: number) {
  if (!isValidLine(line)) {
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert("Unable to map a line for this comment.");
    return;
  }
  const presetBody = document.documentElement.dataset.semadiffCommentBody;
  // biome-ignore lint/suspicious/noAlert: prompt keeps direct API flow minimal.
  const body = presetBody ?? window.prompt("Enter comment text");
  if (!body || body.trim().length === 0) {
    return;
  }
  const fileNode = document.querySelector<HTMLElement>(
    `div.file[data-path='${path}']`
  );
  if (!fileNode) {
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert("Unable to locate file in GitHub diff.");
    return;
  }
  const lineNode = findLineNode(fileNode, line);
  if (!lineNode) {
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert("Unable to locate the mapped line in GitHub diff.");
    return;
  }
  const commentButton =
    lineNode?.querySelector<HTMLElement>(".js-add-line-comment") ?? null;
  const form =
    lineNode?.querySelector<HTMLFormElement>(".js-inline-comment-form") ??
    commentButton?.closest("form") ??
    null;
  const meta = extractLineMeta({
    fileNode,
    lineNode,
    actionNode: commentButton,
    fallbackLine: line,
  });
  const action =
    (getFormAction(form) || commentButton?.getAttribute("data-url")) ??
    meta.apiUrl ??
    "";
  if (!action) {
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert("Unable to locate comment endpoint for this file.");
    return;
  }

  const bodyField =
    form?.querySelector<HTMLTextAreaElement>("textarea[name]")?.name ??
    "comment[body]";
  const bodyInput = form?.elements.namedItem(bodyField);
  if (
    bodyInput instanceof HTMLInputElement ||
    bodyInput instanceof HTMLTextAreaElement
  ) {
    bodyInput.value = body;
  }

  telemetrySpan("commentApi", { path, line: meta.lineNumber ?? line });
  try {
    const response = await submitFormAction({
      url: action,
      form,
      bodyOverrides: {
        [bodyField]: body,
        path,
        line: meta.lineNumber,
        side: meta.side,
        position: meta.position,
        commit_id: meta.commitId,
      },
    });
    if (!response.ok) {
      // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
      window.alert(`Comment request failed (${response.status}).`);
      telemetrySpan("commentApi", {
        path,
        status: "error",
        code: response.status,
      });
      return;
    }
    telemetrySpan("commentApi", { path, status: "ok" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert(`Comment request failed: ${message}`);
    telemetrySpan("commentApi", { path, status: "error", message });
  }
}

async function resolveThreadViaApi(path: string, line?: number) {
  if (!isValidLine(line)) {
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert("Unable to map a line for this resolution.");
    return;
  }
  const fileNode = document.querySelector<HTMLElement>(
    `div.file[data-path='${path}']`
  );
  if (!fileNode) {
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert("Unable to locate file in GitHub diff.");
    return;
  }
  const lineNode = findLineNode(fileNode, line);
  if (!lineNode) {
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert("Unable to locate the mapped line in GitHub diff.");
    return;
  }
  const resolveButton =
    lineNode?.querySelector<HTMLElement>(".js-resolve-thread") ?? null;
  const form = resolveButton?.closest("form") ?? null;
  const meta = extractLineMeta({
    fileNode,
    lineNode,
    actionNode: resolveButton,
    fallbackLine: line,
  });
  const action =
    resolveButton?.getAttribute("data-url") ??
    (getFormAction(form) || meta.resolveUrl) ??
    "";
  if (!action) {
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert("Unable to locate resolve endpoint for this file.");
    return;
  }
  telemetrySpan("resolveApi", { path, line: meta.lineNumber ?? line });
  try {
    const response = await submitFormAction({
      url: action,
      form,
      bodyOverrides: {
        path,
        line: meta.lineNumber,
        side: meta.side,
        position: meta.position,
        commit_id: meta.commitId,
      },
    });
    if (!response.ok) {
      // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
      window.alert(`Resolve request failed (${response.status}).`);
      telemetrySpan("resolveApi", {
        path,
        status: "error",
        code: response.status,
      });
      return;
    }
    telemetrySpan("resolveApi", { path, status: "ok" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // biome-ignore lint/suspicious/noAlert: native alert provides quick user feedback.
    window.alert(`Resolve request failed: ${message}`);
    telemetrySpan("resolveApi", { path, status: "error", message });
  }
}

function findLineNode(fileNode: HTMLElement, line?: number) {
  if (!isValidLine(line)) {
    return null;
  }
  return fileNode.querySelector<HTMLElement>(`[data-line-number='${line}']`);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountOverlay, { once: true });
} else {
  mountOverlay();
}
