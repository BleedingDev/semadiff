import { describe, expect, test } from "vitest";
import { defaultConfig } from "../src/config";
import {
  listNormalizerRules,
  normalizeText,
  normalizeTextForLanguage,
  resolveNormalizerConfig,
} from "../src/normalizers";

describe("normalizer rules", () => {
  test("lists rule metadata without apply functions", () => {
    const rules = listNormalizerRules();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some((rule) => rule.id === "whitespace")).toBe(true);
    expect(rules.every((rule) => !("apply" in rule))).toBe(true);
  });

  test("whitespace rule collapses repeated whitespace when enabled", () => {
    const output = normalizeText("a   b\t\tc", {
      whitespace: true,
      tailwind: false,
      importOrder: false,
      numericLiterals: false,
    });
    expect(output).toBe("a b c");
  });

  test("tailwind rule sorts static class tokens", () => {
    const output = normalizeText('<div className="z a b" />', {
      whitespace: false,
      tailwind: true,
      importOrder: false,
      numericLiterals: false,
    });
    expect(output).toBe('<div className="a b z" />');
  });

  test("tailwind rule leaves dynamic class expressions unchanged", () => {
    const output = normalizeText('<div className="{foo ? `b a` : `a b`}" />', {
      whitespace: false,
      tailwind: true,
      importOrder: false,
      numericLiterals: false,
    });
    expect(output).toBe('<div className="{foo ? `b a` : `a b`}" />');
  });

  test("import order rule sorts specifiers and keeps aliases stable", () => {
    const output = normalizeText(
      'import { z, type Beta, alpha as A, type Alpha } from "pkg";',
      {
        whitespace: false,
        tailwind: false,
        importOrder: true,
        numericLiterals: false,
      }
    );
    expect(output).toBe(
      'import {alpha as A, type Alpha, type Beta, z} from "pkg";'
    );
  });

  test("import order rule ignores statements without named specifiers", () => {
    const output = normalizeText('import Foo from "pkg";', {
      whitespace: false,
      tailwind: false,
      importOrder: true,
      numericLiterals: false,
    });
    expect(output).toBe('import Foo from "pkg";');
  });

  test("numeric literal rule normalizes separators, bases and exponents", () => {
    const output = normalizeText("0XFF 0B1010 0O77 1_000 1.2_3E+4", {
      whitespace: false,
      tailwind: false,
      importOrder: false,
      numericLiterals: true,
    });
    expect(output).toBe("0xff 0b1010 0o77 1000 1.23e4");
  });
});

describe("normalizer config resolution", () => {
  test("returns global config when language is omitted or wildcard", () => {
    const globalOnly = resolveNormalizerConfig(defaultConfig.normalizers);
    const wildcard = resolveNormalizerConfig(defaultConfig.normalizers, "*");
    expect(globalOnly).toEqual(defaultConfig.normalizers.global);
    expect(wildcard).toEqual(defaultConfig.normalizers.global);
  });

  test("applies per-language overrides and ignores undefined overrides", () => {
    const settings = {
      global: {
        whitespace: true,
        tailwind: true,
        importOrder: false,
        numericLiterals: false,
      },
      perLanguage: {
        ts: {
          tailwind: undefined,
          importOrder: true,
        },
      },
    };
    const resolved = resolveNormalizerConfig(settings, "ts");
    expect(resolved).toEqual({
      whitespace: true,
      tailwind: true,
      importOrder: true,
      numericLiterals: false,
    });
  });

  test("normalizeTextForLanguage uses resolved settings for a language", () => {
    const settings = {
      global: {
        whitespace: true,
        tailwind: false,
        importOrder: false,
        numericLiterals: false,
      },
      perLanguage: {
        ts: {
          whitespace: false,
          importOrder: true,
        },
      },
    };
    const output = normalizeTextForLanguage(
      'import { z, a } from "pkg";',
      settings,
      "ts"
    );
    expect(output).toBe('import {a, z} from "pkg";');
  });
});
