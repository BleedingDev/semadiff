import { Schema } from "effect";

export class ConfigValidationError extends Schema.TaggedError<ConfigValidationError>()(
  "ConfigValidationError",
  {
    source: Schema.String,
    message: Schema.String,
  }
) {}

const NormalizerConfigSchema = Schema.Struct({
  whitespace: Schema.Boolean,
  tailwind: Schema.Boolean,
  importOrder: Schema.Boolean,
  numericLiterals: Schema.Boolean,
});

const NormalizerOverridesSchema = Schema.partial(NormalizerConfigSchema);
const NormalizerPerLanguageSchema = Schema.Record({
  key: Schema.String,
  value: NormalizerOverridesSchema,
});

const NormalizerSettingsSchema = Schema.Struct({
  global: NormalizerConfigSchema,
  perLanguage: NormalizerPerLanguageSchema,
});

const RendererConfigSchema = Schema.Struct({
  format: Schema.Literal("ansi", "plain", "json"),
  layout: Schema.Literal("unified", "side-by-side"),
});

const TelemetryConfigSchema = Schema.Struct({
  enabled: Schema.Boolean,
  exporter: Schema.Literal("console", "otlp-http", "otlp-grpc"),
  endpoint: Schema.optional(Schema.String),
});

export const ConfigSchema = Schema.Struct({
  normalizers: NormalizerSettingsSchema,
  renderer: RendererConfigSchema,
  telemetry: TelemetryConfigSchema,
});
const RendererConfigInputSchema = Schema.partial(RendererConfigSchema);
const TelemetryConfigInputSchema = Schema.partial(TelemetryConfigSchema);

export const ConfigInputSchema = Schema.Struct({
  normalizers: Schema.optional(
    Schema.Struct({
      global: Schema.optional(NormalizerOverridesSchema),
      perLanguage: Schema.optional(NormalizerPerLanguageSchema),
    })
  ),
  renderer: Schema.optional(RendererConfigInputSchema),
  telemetry: Schema.optional(TelemetryConfigInputSchema),
});
const ConfigInputJsonSchema = Schema.parseJson(ConfigInputSchema);

export type Config = Schema.Schema.Type<typeof ConfigSchema>;
export type ConfigInput = Schema.Schema.Type<typeof ConfigInputSchema>;
export type NormalizerConfig = Schema.Schema.Type<
  typeof NormalizerConfigSchema
>;
export type NormalizerOverrides = Schema.Schema.Type<
  typeof NormalizerOverridesSchema
>;
export type NormalizerSettings = Schema.Schema.Type<
  typeof NormalizerSettingsSchema
>;

export type ConfigSource = "default" | "project" | "user" | "env";

export interface ConfigSources {
  normalizers: {
    global: {
      whitespace: ConfigSource;
      tailwind: ConfigSource;
      importOrder: ConfigSource;
      numericLiterals: ConfigSource;
    };
    perLanguage: Record<
      string,
      Partial<Record<keyof NormalizerConfig, ConfigSource>>
    >;
  };
  renderer: {
    format: ConfigSource;
    layout: ConfigSource;
  };
  telemetry: {
    enabled: ConfigSource;
    exporter: ConfigSource;
    endpoint: ConfigSource;
  };
}

export interface ConfigResolution {
  value: Config;
  sources: ConfigSources;
}

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

export const defaultConfig: Config = {
  normalizers: {
    global: {
      whitespace: true,
      tailwind: true,
      importOrder: false,
      numericLiterals: false,
    },
    perLanguage: {},
  },
  renderer: {
    format: "ansi",
    layout: "unified",
  },
  telemetry: {
    enabled: false,
    exporter: "console",
  },
};

export const defaultSources: ConfigSources = {
  normalizers: {
    global: {
      whitespace: "default",
      tailwind: "default",
      importOrder: "default",
      numericLiterals: "default",
    },
    perLanguage: {},
  },
  renderer: {
    format: "default",
    layout: "default",
  },
  telemetry: {
    enabled: "default",
    exporter: "default",
    endpoint: "default",
  },
};

export function decodeConfigInput(source: string, input: unknown): ConfigInput {
  try {
    return Schema.decodeUnknownSync(ConfigInputSchema)(input, {
      onExcessProperty: "error",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw ConfigValidationError.make({ source, message });
  }
}

export function decodeConfigInputJson(
  source: string,
  input: string
): ConfigInput {
  try {
    return Schema.decodeUnknownSync(ConfigInputJsonSchema)(input, {
      onExcessProperty: "error",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw ConfigValidationError.make({ source, message });
  }
}

export function mergeConfig(
  current: ConfigResolution,
  overrides: ConfigInput,
  source: ConfigSource
): ConfigResolution {
  const next: Mutable<ConfigResolution> = {
    value: {
      normalizers: {
        global: { ...current.value.normalizers.global },
        perLanguage: { ...current.value.normalizers.perLanguage },
      },
      renderer: { ...current.value.renderer },
      telemetry: { ...current.value.telemetry },
    },
    sources: {
      normalizers: {
        global: { ...current.sources.normalizers.global },
        perLanguage: { ...current.sources.normalizers.perLanguage },
      },
      renderer: { ...current.sources.renderer },
      telemetry: { ...current.sources.telemetry },
    },
  };

  const applyGlobalNormalizer = (
    key: keyof NormalizerConfig,
    value: boolean | undefined
  ) => {
    if (value !== undefined) {
      next.value.normalizers.global[key] = value;
      next.sources.normalizers.global[key] = source;
    }
  };
  const applyRenderer = <K extends keyof Config["renderer"]>(
    key: K,
    value: Config["renderer"][K] | undefined
  ) => {
    if (value !== undefined) {
      next.value.renderer[key] = value;
      next.sources.renderer[key] = source;
    }
  };
  const applyTelemetry = <K extends keyof Config["telemetry"]>(
    key: K,
    value: Config["telemetry"][K] | undefined
  ) => {
    if (value !== undefined) {
      next.value.telemetry[key] = value;
      next.sources.telemetry[key] = source;
    }
  };

  if (overrides.normalizers) {
    const globalOverrides = overrides.normalizers.global;
    applyGlobalNormalizer("whitespace", globalOverrides?.whitespace);
    applyGlobalNormalizer("tailwind", globalOverrides?.tailwind);
    applyGlobalNormalizer("importOrder", globalOverrides?.importOrder);
    applyGlobalNormalizer("numericLiterals", globalOverrides?.numericLiterals);

    const perLanguage = overrides.normalizers.perLanguage ?? {};
    for (const [language, langOverrides] of Object.entries(perLanguage)) {
      const existing = next.value.normalizers.perLanguage[language] ?? {};
      next.value.normalizers.perLanguage[language] = {
        ...existing,
        ...langOverrides,
      };
      const sourceEntry = next.sources.normalizers.perLanguage[language] ?? {};
      for (const [key, value] of Object.entries(langOverrides)) {
        if (value !== undefined) {
          sourceEntry[key as keyof NormalizerConfig] = source;
        }
      }
      next.sources.normalizers.perLanguage[language] = sourceEntry;
    }
  }

  if (overrides.renderer) {
    applyRenderer("format", overrides.renderer.format);
    applyRenderer("layout", overrides.renderer.layout);
  }

  if (overrides.telemetry) {
    applyTelemetry("enabled", overrides.telemetry.enabled);
    applyTelemetry("exporter", overrides.telemetry.exporter);
    applyTelemetry("endpoint", overrides.telemetry.endpoint);
  }

  return next;
}
