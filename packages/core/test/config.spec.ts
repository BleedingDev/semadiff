import { describe, expect, test } from "vitest";
import type { ConfigResolution } from "../src/config";
import {
  ConfigValidationError,
  decodeConfigInput,
  decodeConfigInputJson,
  defaultConfig,
  defaultSources,
  mergeConfig,
} from "../src/config";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function expectValidationFailure(
  callback: () => unknown
): ConfigValidationError {
  try {
    callback();
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected ConfigValidationError");
}

describe("config decoding", () => {
  test("decodeConfigInput reports validation failures", () => {
    const error = expectValidationFailure(() =>
      decodeConfigInput("env", {
        renderer: { format: "markdown" },
      })
    );
    expect(error.source).toBe("env");
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.message).toContain("format");
  });

  test("decodeConfigInputJson reports validation failures", () => {
    const error = expectValidationFailure(() =>
      decodeConfigInputJson(
        "project",
        JSON.stringify({
          renderer: { layout: "stacked" },
        })
      )
    );
    expect(error.source).toBe("project");
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.message).toContain("layout");
  });
});

describe("mergeConfig", () => {
  test("tracks sources per field across layered overrides", () => {
    const initial: ConfigResolution = {
      value: clone(defaultConfig),
      sources: clone(defaultSources),
    };

    const withProject = mergeConfig(
      initial,
      decodeConfigInput("project", {
        normalizers: {
          global: { whitespace: false },
          perLanguage: { ts: { importOrder: true } },
        },
        renderer: { layout: "side-by-side" },
        telemetry: {
          enabled: true,
          endpoint: "https://collector.example.com",
        },
      }),
      "project"
    );

    const merged = mergeConfig(
      withProject,
      decodeConfigInput("env", {
        normalizers: {
          perLanguage: { ts: { tailwind: false } },
        },
        renderer: { format: "json" },
      }),
      "env"
    );

    expect(merged.sources.normalizers.global.whitespace).toBe("project");
    expect(merged.sources.normalizers.global.tailwind).toBe("default");
    expect(merged.sources.normalizers.perLanguage.ts?.importOrder).toBe(
      "project"
    );
    expect(merged.sources.normalizers.perLanguage.ts?.tailwind).toBe("env");
    expect(merged.sources.renderer.layout).toBe("project");
    expect(merged.sources.renderer.format).toBe("env");
    expect(merged.sources.telemetry.enabled).toBe("project");
    expect(merged.sources.telemetry.endpoint).toBe("project");
    expect(merged.sources.telemetry.exporter).toBe("default");

    expect(merged.value.normalizers.perLanguage.ts).toMatchObject({
      importOrder: true,
      tailwind: false,
    });
    expect(merged.value.renderer.layout).toBe("side-by-side");
    expect(merged.value.renderer.format).toBe("json");
    expect(merged.value.telemetry.endpoint).toBe(
      "https://collector.example.com"
    );
  });
});
