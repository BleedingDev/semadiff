import { execSync } from "node:child_process";
import {
  accessSync,
  constants,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Args, Command, Options } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import type { DiffDocument, NormalizerSettings } from "@semadiff/core";
import {
  ConfigSchema,
  explainDiff,
  renderJson,
  structuralDiff,
  Telemetry,
  TelemetryLive,
} from "@semadiff/core";
import { lightningCssParsers } from "@semadiff/parser-lightningcss";
import { swcParsers } from "@semadiff/parser-swc";
import { treeSitterWasmParsers } from "@semadiff/parser-tree-sitter-wasm";
import type { LanguageId } from "@semadiff/parsers";
import { makeRegistry } from "@semadiff/parsers";
import type * as PrBackend from "@semadiff/pr-backend";
import {
  renderTerminal,
  renderTerminalLinesFromHtml,
} from "@semadiff/render-terminal";
import { Console, Effect, Schema } from "effect";
import { resolveConfig } from "./config/resolve.js";

const catchRecoverable = Effect.catchAll;

const isSourceRun = fileURLToPath(import.meta.url).includes(
  `${path.sep}packages${path.sep}cli${path.sep}src${path.sep}`
);
const prBackendModule = (await import(
  isSourceRun
    ? new URL("../../pr-backend/src/index.ts", import.meta.url).href
    : "@semadiff/pr-backend"
)) as typeof PrBackend;
const { FileDiffDocumentSchema, PrDiffLive, PrDiffService, PrSummarySchema } =
  prBackendModule;

interface DiffArgs {
  oldPath: string;
  newPath: string;
  format: "ansi" | "plain" | "json";
  layout: "unified" | "side-by-side";
  view: "semantic" | "lines";
  language?: LanguageId;
}

function readInput(path: string): string {
  if (path === "-") {
    return readFileSync(0, "utf8");
  }
  return readFileSync(path, "utf8");
}

function isBinary(text: string) {
  return text.includes("\u0000");
}

function encodeJson<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  value: Schema.Schema.Type<S>,
  space?: number
) {
  const jsonSchema = Schema.parseJson(
    schema,
    space === undefined ? undefined : { space }
  ) as unknown as Schema.Schema<Schema.Schema.Type<S>, string, never>;
  return Schema.encodeSync(jsonSchema)(value);
}

const languageChoices = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "css",
  "json",
  "md",
  "toml",
  "yaml",
  "text",
  "auto",
] as const;

const ParserCapabilitySchema = Schema.Struct({
  hasAstKinds: Schema.Boolean,
  hasTokenRanges: Schema.Boolean,
  supportsErrorRecovery: Schema.Boolean,
  supportsIncrementalParse: Schema.Boolean,
});
const ParserCapabilitiesSchema = Schema.Record({
  key: Schema.String,
  value: ParserCapabilitySchema,
});
const DoctorReportSchema = Schema.Struct({
  bun: Schema.String,
  git: Schema.String,
  cwd: Schema.String,
  canWriteCwd: Schema.Boolean,
  parsers: ParserCapabilitiesSchema,
});
const DoctorReportJson = Schema.parseJson(DoctorReportSchema);

const NormalizerIdSchema = Schema.Literal(
  "whitespace",
  "tailwind",
  "importOrder",
  "numericLiterals"
);
const NormalizerLanguageSchema = Schema.Literal(
  "ts",
  "tsx",
  "js",
  "jsx",
  "css",
  "json",
  "md",
  "toml",
  "yaml",
  "text",
  "*"
);
const NormalizerSafetySchema = Schema.Literal("conservative", "aggressive");
const NormalizerRuleSummarySchema = Schema.Struct({
  id: NormalizerIdSchema,
  description: Schema.String,
  language: NormalizerLanguageSchema,
  safety: NormalizerSafetySchema,
  defaultEnabled: Schema.Boolean,
});
const NormalizerRulesSchema = Schema.Array(NormalizerRuleSummarySchema);

const ConfigSourceSchema = Schema.Literal("default", "project", "user", "env");
const NormalizerSourceSchema = Schema.Struct({
  whitespace: ConfigSourceSchema,
  tailwind: ConfigSourceSchema,
  importOrder: ConfigSourceSchema,
  numericLiterals: ConfigSourceSchema,
});
const NormalizerSourceOverridesSchema = Schema.partial(NormalizerSourceSchema);
const NormalizerSourcesSchema = Schema.Struct({
  global: NormalizerSourceSchema,
  perLanguage: Schema.Record({
    key: Schema.String,
    value: NormalizerSourceOverridesSchema,
  }),
});
const ConfigSourcesSchema = Schema.Struct({
  normalizers: NormalizerSourcesSchema,
  renderer: Schema.Struct({
    format: ConfigSourceSchema,
    layout: ConfigSourceSchema,
  }),
  telemetry: Schema.Struct({
    enabled: ConfigSourceSchema,
    exporter: ConfigSourceSchema,
    endpoint: ConfigSourceSchema,
  }),
});
const ResolvedConfigOutputSchema = Schema.Struct({
  config: ConfigSchema,
  sources: ConfigSourcesSchema,
  normalizerRules: NormalizerRulesSchema,
  paths: Schema.Struct({
    project: Schema.String,
    user: Schema.String,
  }),
});
const ResolvedConfigOutputJson = Schema.parseJson(ResolvedConfigOutputSchema);

const BenchCaseSchema = Schema.Struct({
  id: Schema.String,
  durationMs: Schema.Number,
  operationCount: Schema.Number,
  moveCount: Schema.Number,
  renameCount: Schema.Number,
});
const BenchReportSchema = Schema.Struct({
  version: Schema.String,
  timestamp: Schema.String,
  threshold: Schema.Number,
  cases: Schema.Array(BenchCaseSchema),
  totals: Schema.Struct({
    durationMs: Schema.Number,
  }),
});
const BenchReportJson = Schema.parseJson(BenchReportSchema);
const BenchRegressionSchema = Schema.Struct({
  id: Schema.String,
  baselineMs: Schema.Number,
  currentMs: Schema.Number,
  regression: Schema.Boolean,
});
const BenchOutputSchema = Schema.Struct({
  report: BenchReportSchema,
  baselinePath: Schema.String,
  regressions: Schema.Array(BenchRegressionSchema),
});
const BenchOutputJson = Schema.parseJson(BenchOutputSchema);

const DiffOperationTypeSchema = Schema.Literal(
  "insert",
  "delete",
  "update",
  "move"
);
const ExplainOperationSchema = Schema.Struct({
  id: Schema.String,
  type: DiffOperationTypeSchema,
  rationale: Schema.String,
  confidence: Schema.optional(Schema.Number),
  moveId: Schema.optional(Schema.String),
  renameGroupId: Schema.optional(Schema.String),
});
const ExplainDocumentSchema = Schema.Struct({
  version: Schema.Literal("0.1.0"),
  operations: Schema.Array(ExplainOperationSchema),
  moves: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      confidence: Schema.Number,
      rationale: Schema.String,
    })
  ),
  renames: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      from: Schema.String,
      to: Schema.String,
      occurrences: Schema.Number,
      confidence: Schema.Number,
      rationale: Schema.String,
    })
  ),
});
const ExplainDocumentJson = Schema.parseJson(ExplainDocumentSchema);

class CliSystemError extends Schema.TaggedError<CliSystemError>()(
  "CliSystemError",
  {
    operation: Schema.String,
    error: Schema.Defect,
  }
) {}

const formatOption = Options.choice("format", [
  "ansi",
  "plain",
  "json",
] as const).pipe(
  Options.withDefault("ansi"),
  Options.withDescription("Output format.")
);
const layoutOption = Options.choice("layout", [
  "unified",
  "side-by-side",
] as const).pipe(
  Options.withDefault("unified"),
  Options.withDescription("Diff layout.")
);
const viewOption = Options.choice("view", ["semantic", "lines"] as const).pipe(
  Options.withDefault("lines"),
  Options.withDescription("Render semantic ops or line diff view.")
);
const languageOption = Options.choice("language", languageChoices).pipe(
  Options.withDefault("auto"),
  Options.withDescription("Language hint (auto to infer).")
);
const prContextOption = Options.integer("context").pipe(
  Options.withDefault(3),
  Options.withDescription("Line context for diff caching (default 3).")
);
const prMovesOption = Options.boolean("moves").pipe(
  Options.withDefault(true),
  Options.withDescription("Enable move detection.")
);
const prSummaryCompactOption = Options.boolean("compact").pipe(
  Options.withDefault(false),
  Options.withDescription("Print compact JSON (no whitespace).")
);

function inferLanguageFromPath(path?: string): LanguageId | undefined {
  if (!path || path === "-") {
    return undefined;
  }
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
      return "ts";
    case "tsx":
      return "tsx";
    case "js":
      return "js";
    case "jsx":
      return "jsx";
    case "css":
      return "css";
    case "json":
      return "json";
    case "md":
    case "markdown":
      return "md";
    case "toml":
      return "toml";
    case "yaml":
    case "yml":
      return "yaml";
    default:
      return undefined;
  }
}

const parserRegistry = makeRegistry([
  ...swcParsers,
  ...lightningCssParsers,
  ...treeSitterWasmParsers,
]);

function runDiffEffect(params: {
  oldText: string;
  newText: string;
  format: DiffArgs["format"];
  layout: DiffArgs["layout"];
  view: DiffArgs["view"];
  language?: LanguageId;
  normalizers: NormalizerSettings;
  oldPath?: string;
  newPath?: string;
  telemetryContext?: Record<string, unknown>;
}) {
  return Effect.gen(function* () {
    const telemetry = yield* Telemetry;
    const parseLanguage = params.language;
    const makeParseInput = (content: string, path?: string) => ({
      content,
      ...(path ? { path } : {}),
      ...(parseLanguage ? { language: parseLanguage } : {}),
    });
    const parsedOld = yield* telemetry.span(
      "parse",
      { side: "old", path: params.oldPath, ...params.telemetryContext },
      parserRegistry.parse(makeParseInput(params.oldText, params.oldPath))
    );
    const parsedNew = yield* telemetry.span(
      "parse",
      { side: "new", path: params.newPath, ...params.telemetryContext },
      parserRegistry.parse(makeParseInput(params.newText, params.newPath))
    );
    const effectiveLanguage =
      params.language ?? parsedOld.language ?? parsedNew.language;
    const oldNodeCount = parsedOld.lines.length;
    const newNodeCount = parsedNew.lines.length;
    const oldSizeBytes = Buffer.byteLength(params.oldText, "utf8");
    const newSizeBytes = Buffer.byteLength(params.newText, "utf8");
    yield* telemetry.span(
      "normalize",
      { language: effectiveLanguage },
      Effect.sync(() => undefined)
    );
    const diff = yield* telemetry.span(
      "diff",
      {
        language: effectiveLanguage,
        oldSize: params.oldText.length,
        newSize: params.newText.length,
        oldSizeBytes,
        newSizeBytes,
        oldNodeCount,
        newNodeCount,
        ...params.telemetryContext,
      },
      Effect.sync(() =>
        structuralDiff(params.oldText, params.newText, {
          normalizers: params.normalizers,
          language: effectiveLanguage,
          oldRoot: parsedOld.root,
          newRoot: parsedNew.root,
          ...(parsedOld.tokens !== undefined
            ? { oldTokens: parsedOld.tokens }
            : {}),
          ...(parsedNew.tokens !== undefined
            ? { newTokens: parsedNew.tokens }
            : {}),
        })
      )
    );
    yield* telemetry.metric(
      "semadiff.diff.operations",
      diff.operations.length,
      {
        language: effectiveLanguage,
        ...params.telemetryContext,
      }
    );
    yield* telemetry.metric("semadiff.diff.moves", diff.moves.length, {
      language: effectiveLanguage,
      ...params.telemetryContext,
    });
    yield* telemetry.metric("semadiff.diff.renames", diff.renames.length, {
      language: effectiveLanguage,
      ...params.telemetryContext,
    });
    yield* telemetry.log("diff_complete", {
      operationCount: diff.operations.length,
      moveCount: diff.moves.length,
      renameCount: diff.renames.length,
      language: effectiveLanguage,
      oldNodeCount,
      newNodeCount,
      oldSizeBytes,
      newSizeBytes,
      ...params.telemetryContext,
    });

    const output = yield* telemetry.span(
      "render",
      {
        operationCount: diff.operations.length,
        moveCount: diff.moves.length,
        renameCount: diff.renames.length,
        ...params.telemetryContext,
      },
      Effect.sync(() => {
        if (params.format === "json") {
          return renderJson(diff);
        }
        return renderTerminal(diff, {
          format: params.format,
          layout: params.layout,
          view: params.view,
          oldText: params.oldText,
          newText: params.newText,
          language: effectiveLanguage,
        });
      })
    );

    return output;
  });
}

const diffCommand = Command.make(
  "diff",
  {
    oldPath: Args.text({ name: "old" }),
    newPath: Args.text({ name: "new" }),
    format: formatOption,
    layout: layoutOption,
    view: viewOption,
    language: languageOption,
  },
  ({ oldPath, newPath, format, layout, view, language }) =>
    resolveConfig.pipe(
      Effect.flatMap((resolved) => {
        const telemetryOptions = {
          enabled: resolved.config.telemetry.enabled,
          exporter: resolved.config.telemetry.exporter,
          ...(resolved.config.telemetry.endpoint
            ? { endpoint: resolved.config.telemetry.endpoint }
            : {}),
        };
        const telemetryLayer = TelemetryLive(telemetryOptions);
        return Effect.gen(function* () {
          const inferredLanguage =
            language === "auto"
              ? inferLanguageFromPath(oldPath !== "-" ? oldPath : newPath)
              : (language as LanguageId);
          const telemetry = yield* Telemetry;
          const oldText = yield* telemetry.span(
            "read",
            { side: "old", path: oldPath },
            Effect.sync(() => readInput(oldPath))
          );
          const newText = yield* telemetry.span(
            "read",
            { side: "new", path: newPath },
            Effect.sync(() => readInput(newPath))
          );

          if (isBinary(oldText) || isBinary(newText)) {
            yield* Console.log("Binary file detected; semantic diff skipped.");
            return;
          }

          const program = runDiffEffect({
            oldText,
            newText,
            format,
            layout,
            view,
            normalizers: resolved.config.normalizers,
            oldPath,
            newPath,
            telemetryContext: { command: "diff" },
            ...(inferredLanguage ? { language: inferredLanguage } : {}),
          });

          const output = yield* telemetry.span(
            "run",
            { command: "diff" },
            program
          );
          yield* Console.log(output);
        }).pipe(Effect.provide(telemetryLayer));
      })
    )
).pipe(Command.withDescription("Run a semantic diff between two files."));

const prSummaryCommand = Command.make(
  "summary",
  {
    prUrl: Args.text({ name: "pr" }),
    compact: prSummaryCompactOption,
  },
  ({ prUrl, compact }) =>
    Effect.gen(function* () {
      const service = yield* PrDiffService;
      const summary = yield* service.getSummary(prUrl);
      const json = encodeJson(
        PrSummarySchema,
        summary,
        compact ? undefined : 2
      );
      yield* Console.log(json);
    }).pipe(Effect.provide(PrDiffLive))
).pipe(Command.withDescription("Fetch PR summary from GitHub."));

const prFileCommand = Command.make(
  "file",
  {
    prUrl: Args.text({ name: "pr" }),
    file: Args.text({ name: "file" }),
    format: formatOption,
    layout: layoutOption,
    view: viewOption,
    context: prContextOption,
    moves: prMovesOption,
  },
  ({ prUrl, file, format, layout, view, context, moves }) =>
    Effect.gen(function* () {
      const service = yield* PrDiffService;
      const lineLayout = layout === "side-by-side" ? "split" : "unified";
      if (format === "json") {
        const result = yield* service.getFileDiffDocument(
          prUrl,
          file,
          context,
          lineLayout,
          moves
        );
        yield* Console.log(encodeJson(FileDiffDocumentSchema, result, 2));
        return;
      }
      if (view === "lines") {
        const result = yield* service.getFileDiff(
          prUrl,
          file,
          context,
          lineLayout,
          "semantic",
          false,
          moves
        );
        if (result.file.warnings?.length) {
          for (const warning of result.file.warnings) {
            yield* Console.log(`WARNING: ${warning}`);
          }
        }
        yield* Console.log(
          `File: ${result.file.filename} (${result.file.additions}+ / ${result.file.deletions}-)`
        );
        const output = renderTerminalLinesFromHtml(result.linesHtml, {
          format,
          layout,
          contextLines: context,
        });
        yield* Console.log(output);
        return;
      }
      const result = yield* service.getFileDiffDocument(
        prUrl,
        file,
        context,
        lineLayout,
        moves
      );
      if (result.file.warnings?.length) {
        for (const warning of result.file.warnings) {
          yield* Console.log(`WARNING: ${warning}`);
        }
      }
      yield* Console.log(
        `File: ${result.file.filename} (${result.file.additions}+ / ${result.file.deletions}-)`
      );
      const diff: DiffDocument = {
        ...result.diff,
        operations: [...result.diff.operations],
        moves: result.diff.moves.map((move) => ({
          ...move,
          operations: [...move.operations],
        })),
        renames: [...result.diff.renames],
      };
      const output = renderTerminal(diff, {
        format,
        layout,
        view,
      });
      yield* Console.log(output);
    }).pipe(Effect.provide(PrDiffLive))
).pipe(Command.withDescription("Render semantic diff for a PR file."));

const prCommand = Command.make("pr", {}, () => Effect.void).pipe(
  Command.withSubcommands([prSummaryCommand, prFileCommand])
);

const gitExternalCommand = Command.make(
  "git-external",
  {
    path: Args.text({ name: "path" }),
    oldFile: Args.text({ name: "oldFile" }),
    oldHex: Args.text({ name: "oldHex" }),
    oldMode: Args.text({ name: "oldMode" }),
    newFile: Args.text({ name: "newFile" }),
    newHex: Args.text({ name: "newHex" }),
    newMode: Args.text({ name: "newMode" }),
    extra: Args.repeated(Args.text({ name: "extra" })),
  },
  ({ oldFile, newFile }) =>
    resolveConfig.pipe(
      Effect.flatMap((resolved) => {
        const telemetryOptions = {
          enabled: resolved.config.telemetry.enabled,
          exporter: resolved.config.telemetry.exporter,
          ...(resolved.config.telemetry.endpoint
            ? { endpoint: resolved.config.telemetry.endpoint }
            : {}),
        };
        const telemetryLayer = TelemetryLive(telemetryOptions);
        return Effect.gen(function* () {
          const telemetry = yield* Telemetry;
          const oldText =
            oldFile === "/dev/null"
              ? ""
              : yield* telemetry.span(
                  "read",
                  { side: "old", path: oldFile },
                  Effect.sync(() => readInput(oldFile))
                );
          const newText =
            newFile === "/dev/null"
              ? ""
              : yield* telemetry.span(
                  "read",
                  { side: "new", path: newFile },
                  Effect.sync(() => readInput(newFile))
                );
          const inferredLanguage =
            inferLanguageFromPath(
              oldFile !== "/dev/null" ? oldFile : newFile
            ) ?? undefined;
          if (isBinary(oldText) || isBinary(newText)) {
            yield* Console.log("Binary file detected; semantic diff skipped.");
            return;
          }
          const program = runDiffEffect({
            oldText,
            newText,
            format: resolved.config.renderer.format,
            layout: resolved.config.renderer.layout,
            view: "lines",
            normalizers: resolved.config.normalizers,
            oldPath: oldFile,
            newPath: newFile,
            telemetryContext: { command: "git-external" },
            ...(inferredLanguage ? { language: inferredLanguage } : {}),
          });
          const output = yield* telemetry.span(
            "run",
            { command: "git-external" },
            program
          );
          yield* Console.log(output);
        }).pipe(Effect.provide(telemetryLayer));
      })
    )
).pipe(Command.withDescription("Git external diff adapter (7-arg contract)."));

const difftoolCommand = Command.make(
  "difftool",
  {
    local: Args.text({ name: "local" }).pipe(Args.withDefault("")),
    remote: Args.text({ name: "remote" }).pipe(Args.withDefault("")),
  },
  ({ local, remote }) =>
    resolveConfig.pipe(
      Effect.flatMap((resolved) => {
        const telemetryOptions = {
          enabled: resolved.config.telemetry.enabled,
          exporter: resolved.config.telemetry.exporter,
          ...(resolved.config.telemetry.endpoint
            ? { endpoint: resolved.config.telemetry.endpoint }
            : {}),
        };
        const telemetryLayer = TelemetryLive(telemetryOptions);
        return Effect.gen(function* () {
          const localPath = local || process.env.LOCAL;
          const remotePath = remote || process.env.REMOTE;
          if (!(localPath && remotePath)) {
            yield* Console.error("difftool requires LOCAL and REMOTE paths");
            return;
          }
          const telemetry = yield* Telemetry;
          const oldText = yield* telemetry.span(
            "read",
            { side: "old", path: localPath },
            Effect.sync(() => readInput(localPath))
          );
          const newText = yield* telemetry.span(
            "read",
            { side: "new", path: remotePath },
            Effect.sync(() => readInput(remotePath))
          );
          if (isBinary(oldText) || isBinary(newText)) {
            yield* Console.log("Binary file detected; semantic diff skipped.");
            return;
          }
          const inferredLanguage =
            inferLanguageFromPath(localPath) ?? undefined;
          const output = yield* telemetry.span(
            "run",
            { command: "difftool" },
            runDiffEffect({
              oldText,
              newText,
              format: resolved.config.renderer.format,
              layout: resolved.config.renderer.layout,
              view: "lines",
              normalizers: resolved.config.normalizers,
              oldPath: localPath,
              newPath: remotePath,
              telemetryContext: { command: "difftool" },
              ...(inferredLanguage ? { language: inferredLanguage } : {}),
            })
          );
          yield* Console.log(output);
        }).pipe(Effect.provide(telemetryLayer));
      })
    )
).pipe(
  Command.withDescription("Difftool wrapper compatible with git difftool.")
);

const installGitCommand = Command.make("install-git", {}, () =>
  Effect.gen(function* () {
    const snippet = [
      "# Semadiff external diff",
      "[diff]",
      "  external = semadiff git-external",
      '[difftool "semadiff"]',
      "  cmd = semadiff difftool $LOCAL $REMOTE",
      "# verify",
      "#   git diff --ext-diff",
      "#   git show --ext-diff",
      "#   git log -p --ext-diff",
      "#   git difftool --tool=semadiff",
    ].join("\n");
    yield* Console.log(snippet);
  })
).pipe(Command.withDescription("Print git config snippets for semadiff."));

const doctorCommand = Command.make("doctor", {}, () =>
  Effect.gen(function* () {
    const bunVersion = process.versions.bun ?? "unknown";
    const gitVersion = yield* Effect.try({
      try: () => execSync("git --version").toString().trim(),
      catch: (error) =>
        CliSystemError.make({ operation: "git-version", error }),
    }).pipe(catchRecoverable(() => Effect.succeed("not found")));
    const canWriteCwd = yield* Effect.try({
      try: () => {
        accessSync(process.cwd(), constants.W_OK);
        return true;
      },
      catch: (error) => CliSystemError.make({ operation: "access-cwd", error }),
    }).pipe(catchRecoverable(() => Effect.succeed(false)));
    const report = {
      bun: bunVersion,
      git: gitVersion,
      cwd: process.cwd(),
      canWriteCwd,
      parsers: parserRegistry.listCapabilities(),
    };
    const json = yield* Schema.encode(DoctorReportJson)(report).pipe(
      Effect.orDie
    );
    yield* Console.log(json);
  })
).pipe(
  Command.withDescription("Report environment details and parser capabilities.")
);

const benchBaselineOption = Options.text("baseline").pipe(
  Options.withDefault("bench/baseline.json"),
  Options.withDescription("Baseline JSON path.")
);
const benchWriteOption = Options.boolean("write-baseline").pipe(
  Options.withDefault(false),
  Options.withDescription("Write the current run as the baseline.")
);
const benchThresholdOption = Options.text("threshold").pipe(
  Options.withDefault("0.1"),
  Options.withDescription("Regression threshold ratio.")
);

const benchCommand = Command.make(
  "bench",
  {
    baseline: benchBaselineOption,
    writeBaseline: benchWriteOption,
    threshold: benchThresholdOption,
  },
  ({ baseline, writeBaseline, threshold }) =>
    Effect.gen(function* () {
      const baselinePath = baseline;
      const thresholdValue = Number.parseFloat(threshold);
      const regressionThreshold = Number.isFinite(thresholdValue)
        ? thresholdValue
        : 0.1;
      const yamlLarge = Array.from(
        { length: 200 },
        (_, index) => `key_${index}: ${index}`
      ).join("\n");
      const yamlLargeUpdated = Array.from(
        { length: 200 },
        (_, index) => `key_${index}: ${index + 1}`
      ).join("\n");
      const tomlLarge = Array.from(
        { length: 200 },
        (_, index) => `key_${index} = ${index}`
      ).join("\n");
      const tomlLargeUpdated = Array.from(
        { length: 200 },
        (_, index) => `key_${index} = ${index + 1}`
      ).join("\n");
      const tsMediumOld = Array.from(
        { length: 120 },
        (_, index) => `export const value${index} = ${index};`
      ).join("\n");
      const tsMediumNew = Array.from(
        { length: 120 },
        (_, index) => `export const value${index} = ${index + 1};`
      ).join("\n");
      const cssMediumOld = Array.from(
        { length: 80 },
        (_, index) =>
          `.class-${index} { color: #${(index * 3).toString(16).padStart(6, "0")}; }`
      ).join("\n");
      const cssMediumNew = Array.from(
        { length: 80 },
        (_, index) =>
          `.class-${index} { color: #${(index * 7).toString(16).padStart(6, "0")}; }`
      ).join("\n");

      const cases = [
        {
          id: "small-js",
          oldText: "const foo = 1;\\nfoo + foo;",
          newText: "const bar = 2;\\nbar + bar;",
        },
        {
          id: "tailwind",
          oldText: '<div className="text-sm bg-red-500" />',
          newText: '<div className="bg-red-500 text-sm" />',
        },
        {
          id: "tailwind-heavy",
          oldText:
            '<div className="p-2 m-2 text-sm bg-red-500 font-semibold text-white rounded shadow" />',
          newText:
            '<div className="text-white shadow rounded font-semibold bg-red-500 text-sm p-2 m-2" />',
        },
        {
          id: "moved-block",
          oldText: "alpha\\nblock\\none\\nblock\\ntwo\\nomega",
          newText: "alpha\\nomega\\nblock\\none\\nblock\\ntwo",
        },
        {
          id: "yaml-large",
          oldText: yamlLarge,
          newText: yamlLargeUpdated,
        },
        {
          id: "toml-large",
          oldText: tomlLarge,
          newText: tomlLargeUpdated,
        },
        {
          id: "ts-medium",
          oldText: tsMediumOld,
          newText: tsMediumNew,
        },
        {
          id: "css-medium",
          oldText: cssMediumOld,
          newText: cssMediumNew,
        },
      ];

      const results = cases.map((item) => {
        const start = Date.now();
        const diff = structuralDiff(item.oldText, item.newText);
        const durationMs = Date.now() - start;
        return {
          id: item.id,
          durationMs,
          operationCount: diff.operations.length,
          moveCount: diff.moves.length,
          renameCount: diff.renames.length,
        };
      });

      const report = {
        version: "0.1.0",
        timestamp: new Date().toISOString(),
        threshold: regressionThreshold,
        cases: results,
        totals: {
          durationMs: results.reduce(
            (sum, result) => sum + result.durationMs,
            0
          ),
        },
      };

      const baselineRaw = yield* Effect.try({
        try: () => readFileSync(baselinePath, "utf8"),
        catch: (error) =>
          CliSystemError.make({ operation: "read-benchmark-baseline", error }),
      }).pipe(catchRecoverable(() => Effect.succeed(null)));
      const baselineReport =
        baselineRaw === null
          ? null
          : yield* Schema.decodeUnknown(BenchReportJson)(baselineRaw).pipe(
              catchRecoverable(() => Effect.succeed(null))
            );

      const regressions =
        baselineReport?.cases
          ?.map((baseCase) => {
            const current = results.find((result) => result.id === baseCase.id);
            if (!current) {
              return null;
            }
            const delta = current.durationMs - baseCase.durationMs;
            const ratio =
              baseCase.durationMs === 0 ? 0 : delta / baseCase.durationMs;
            return {
              id: baseCase.id,
              baselineMs: baseCase.durationMs,
              currentMs: current.durationMs,
              regression: ratio > regressionThreshold,
            };
          })
          .filter(
            (
              entry
            ): entry is Schema.Schema.Type<typeof BenchRegressionSchema> =>
              entry !== null
          ) ?? [];

      if (writeBaseline) {
        const dir = baselinePath.split("/").slice(0, -1).join("/");
        if (dir) {
          mkdirSync(dir, { recursive: true });
        }
        const reportJson = yield* Schema.encode(BenchReportJson)(report).pipe(
          Effect.orDie
        );
        writeFileSync(baselinePath, reportJson);
      }

      const outputJson = yield* Schema.encode(BenchOutputJson)({
        report,
        baselinePath,
        regressions,
      }).pipe(Effect.orDie);
      yield* Console.log(outputJson);

      const hasRegression = regressions.some(
        (entry) => (entry as { regression?: boolean }).regression
      );
      if (hasRegression) {
        yield* Console.error("Benchmark regression detected.");
        process.exitCode = 1;
      }
    })
).pipe(Command.withDescription("Run benchmarks and compare to baseline."));

const explainCommand = Command.make(
  "explain",
  {
    oldPath: Args.text({ name: "old" }),
    newPath: Args.text({ name: "new" }),
    language: languageOption,
  },
  ({ oldPath, newPath, language }) =>
    Effect.gen(function* () {
      const resolved = yield* resolveConfig;
      const inferredLanguage =
        language === "auto"
          ? inferLanguageFromPath(oldPath !== "-" ? oldPath : newPath)
          : (language as LanguageId);
      const oldText = readInput(oldPath);
      const newText = readInput(newPath);
      if (isBinary(oldText) || isBinary(newText)) {
        yield* Console.log("Binary file detected; semantic diff skipped.");
        return;
      }
      const makeParseInput = (content: string, path?: string) => ({
        content,
        ...(path ? { path } : {}),
        ...(inferredLanguage ? { language: inferredLanguage } : {}),
      });
      const parsedOld = yield* parserRegistry.parse(
        makeParseInput(oldText, oldPath)
      );
      const parsedNew = yield* parserRegistry.parse(
        makeParseInput(newText, newPath)
      );
      const effectiveLanguage =
        inferredLanguage ?? parsedOld.language ?? parsedNew.language;
      const diff = structuralDiff(oldText, newText, {
        normalizers: resolved.config.normalizers,
        ...(effectiveLanguage ? { language: effectiveLanguage } : {}),
        oldRoot: parsedOld.root,
        newRoot: parsedNew.root,
        ...(parsedOld.tokens !== undefined
          ? { oldTokens: parsedOld.tokens }
          : {}),
        ...(parsedNew.tokens !== undefined
          ? { newTokens: parsedNew.tokens }
          : {}),
      });
      const explainJson = yield* Schema.encode(ExplainDocumentJson)(
        explainDiff(diff)
      ).pipe(Effect.orDie);
      yield* Console.log(explainJson);
    })
).pipe(Command.withDescription("Explain diff decisions as JSON."));

const configCommand = Command.make("config", {}, () =>
  Effect.gen(function* () {
    const resolved = yield* resolveConfig;
    const json = yield* Schema.encode(ResolvedConfigOutputJson)(resolved).pipe(
      Effect.orDie
    );
    yield* Console.log(json);
  })
).pipe(Command.withDescription("Print resolved config with provenance."));

const app = Command.make("semadiff", {}, () => Effect.void).pipe(
  Command.withSubcommands([
    diffCommand,
    gitExternalCommand,
    difftoolCommand,
    installGitCommand,
    configCommand,
    doctorCommand,
    benchCommand,
    explainCommand,
    prCommand,
  ])
);

function normalizeArgv(argv: string[]) {
  if (argv.length <= 2) {
    return argv;
  }
  const head = argv.slice(0, 2);
  const rest = argv.slice(2);
  const patterns: Array<{ path: string[] }> = [
    { path: ["diff"] },
    { path: ["pr", "file"] },
    { path: ["pr", "summary"] },
  ];

  const normalizeTail = (tokens: string[]) => {
    const options: string[] = [];
    const positionals: string[] = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i] ?? "";
      if (token === "--") {
        positionals.push(...tokens.slice(i + 1));
        break;
      }
      if (token.startsWith("-")) {
        options.push(token);
        if (!token.includes("=")) {
          const next = tokens[i + 1];
          if (next && !next.startsWith("-")) {
            options.push(next);
            i += 1;
          }
        }
        continue;
      }
      positionals.push(token);
    }
    return [...options, ...positionals];
  };

  for (const pattern of patterns) {
    const { path } = pattern;
    const idx = rest.findIndex((_value, index) =>
      path.every((segment, offset) => rest[index + offset] === segment)
    );
    if (idx === -1) {
      continue;
    }
    const start = idx + path.length;
    const before = rest.slice(0, start);
    const after = rest.slice(start);
    const normalized = normalizeTail(after);
    return [...head, ...before, ...normalized];
  }

  return argv;
}

const cli = Command.run(app, {
  name: "semadiff",
  version: "0.1.0",
});

cli(normalizeArgv(process.argv)).pipe(
  Effect.provide(BunContext.layer),
  BunRuntime.runMain
);
