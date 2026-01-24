import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  decodeConfigInput,
  decodeConfigInputJson,
  defaultConfig,
  defaultSources,
  listNormalizerRules,
  mergeConfig,
} from "@semadiff/core";
import { Effect } from "effect";

const truthyValues = new Set(["1", "true", "yes", "on"]);
const falsyValues = new Set(["0", "false", "no", "off"]);

function parseBooleanEnv(
  value: string | undefined,
  key: string
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (truthyValues.has(normalized)) {
    return true;
  }
  if (falsyValues.has(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean for ${key}: ${value}`);
}

function parseRendererFormat(
  value: string | undefined
): "ansi" | "plain" | "json" | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "ansi" ||
    normalized === "plain" ||
    normalized === "json"
  ) {
    return normalized;
  }
  throw new Error(`Invalid renderer format: ${value}`);
}

function parseRendererLayout(
  value: string | undefined
): "unified" | "side-by-side" | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "unified" || normalized === "side-by-side") {
    return normalized;
  }
  throw new Error(`Invalid renderer layout: ${value}`);
}

function parseTelemetryExporter(
  value: string | undefined
): "console" | "otlp-http" | "otlp-grpc" | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "console" ||
    normalized === "otlp-http" ||
    normalized === "otlp-grpc"
  ) {
    return normalized;
  }
  throw new Error(`Invalid telemetry exporter: ${value}`);
}

function parseTelemetryEndpoint(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readConfigFile(path: string, source: string) {
  if (!existsSync(path)) {
    return null;
  }
  const raw = readFileSync(path, "utf8");
  try {
    return decodeConfigInputJson(source, raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${source} config: ${message}`);
  }
}

function readEnvConfig(env: NodeJS.ProcessEnv) {
  const normalizers = stripUndefined({
    whitespace: parseBooleanEnv(
      env.SEMADIFF_NORMALIZER_WHITESPACE,
      "SEMADIFF_NORMALIZER_WHITESPACE"
    ),
    tailwind: parseBooleanEnv(
      env.SEMADIFF_NORMALIZER_TAILWIND,
      "SEMADIFF_NORMALIZER_TAILWIND"
    ),
    importOrder: parseBooleanEnv(
      env.SEMADIFF_NORMALIZER_IMPORT_ORDER,
      "SEMADIFF_NORMALIZER_IMPORT_ORDER"
    ),
    numericLiterals: parseBooleanEnv(
      env.SEMADIFF_NORMALIZER_NUMERIC_LITERALS,
      "SEMADIFF_NORMALIZER_NUMERIC_LITERALS"
    ),
  });

  const renderer = stripUndefined({
    format: parseRendererFormat(env.SEMADIFF_RENDERER_FORMAT),
    layout: parseRendererLayout(env.SEMADIFF_RENDERER_LAYOUT),
  });

  const telemetry = stripUndefined({
    enabled: parseBooleanEnv(
      env.SEMADIFF_TELEMETRY_ENABLED,
      "SEMADIFF_TELEMETRY_ENABLED"
    ),
    exporter: parseTelemetryExporter(env.SEMADIFF_TELEMETRY_EXPORTER),
    endpoint: parseTelemetryEndpoint(env.SEMADIFF_TELEMETRY_ENDPOINT),
  });

  const raw: Record<string, unknown> = {};
  if (Object.keys(normalizers).length > 0) {
    raw.normalizers = { global: normalizers };
  }
  if (Object.keys(renderer).length > 0) {
    raw.renderer = renderer;
  }
  if (Object.keys(telemetry).length > 0) {
    raw.telemetry = telemetry;
  }

  return decodeConfigInput("env", raw);
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output as Partial<T>;
}

export interface ResolvedConfigOutput {
  config: typeof defaultConfig;
  sources: typeof defaultSources;
  normalizerRules: ReturnType<typeof listNormalizerRules>;
  paths: {
    project: string;
    user: string;
  };
}

export const resolveConfig = Effect.sync((): ResolvedConfigOutput => {
  const projectPath = join(process.cwd(), "semadiff.config.json");
  const userPath = join(homedir(), ".config", "semadiff", "config.json");

  let resolution = {
    value: { ...defaultConfig },
    sources: { ...defaultSources },
  };

  const projectConfig = readConfigFile(projectPath, "project");
  if (projectConfig) {
    resolution = mergeConfig(resolution, projectConfig, "project");
  }

  const userConfig = readConfigFile(userPath, "user");
  if (userConfig) {
    resolution = mergeConfig(resolution, userConfig, "user");
  }

  const envConfig = readEnvConfig(process.env);
  resolution = mergeConfig(resolution, envConfig, "env");

  return {
    config: resolution.value,
    sources: resolution.sources,
    normalizerRules: listNormalizerRules(),
    paths: {
      project: projectPath,
      user: userPath,
    },
  };
});
