import type { NormalizerConfig, NormalizerSettings } from "./config.js";

export type NormalizerLanguage =
  | "ts"
  | "tsx"
  | "js"
  | "jsx"
  | "css"
  | "md"
  | "toml"
  | "yaml"
  | "text"
  | "*";

export type NormalizerSafety = "conservative" | "aggressive";

export interface NormalizerRule {
  id: keyof NormalizerConfig;
  description: string;
  language: NormalizerLanguage;
  safety: NormalizerSafety;
  defaultEnabled: boolean;
  apply: (text: string) => string;
}

export type NormalizerRuleSummary = Omit<NormalizerRule, "apply">;

const WHITESPACE_SPLIT_RE = /\s+/;
const AS_SPLIT_RE = /\s+as\s+/i;
const EXPONENT_SPLIT_RE = /[eE]/;

const whitespaceRule: NormalizerRule = {
  id: "whitespace",
  description: "Collapse repeated whitespace.",
  language: "*",
  safety: "conservative",
  defaultEnabled: true,
  apply: (text) => text.replace(/\s+/g, " ").trim(),
};

const tailwindRule: NormalizerRule = {
  id: "tailwind",
  description: "Sort Tailwind class tokens in static class strings.",
  language: "*",
  safety: "conservative",
  defaultEnabled: true,
  apply: (text) => {
    const normalizedText = text.replace(/-\[var\((--[^)]+)\)\]/g, "-($1)");
    return normalizedText.replace(
      /(class|className)=("([^"]*)"|'([^']*)')/g,
      (
        match: string,
        attr: string,
        full: string,
        doubleQuoted?: string,
        singleQuoted?: string
      ) => {
        const raw = doubleQuoted ?? singleQuoted ?? "";
        if (raw.includes("{") || raw.includes("}")) {
          return match;
        }
        const tokens = raw
          .split(WHITESPACE_SPLIT_RE)
          .map((token) =>
            token.trim().replace(/-\[var\((--[^)]+)\)\]/g, "-($1)")
          )
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        const normalized = tokens.join(" ");
        return `${attr}=${full[0]}${normalized}${full[0]}`;
      }
    );
  },
};

const importOrderRule: NormalizerRule = {
  id: "importOrder",
  description: "Sort named import/export specifiers in a stable order.",
  language: "*",
  safety: "aggressive",
  defaultEnabled: false,
  apply: (text) =>
    text.replace(
      /^\s*(?:import|export)\s+(?:type\s+)?[^;]*;?/gm,
      (statement: string) => {
        const open = statement.indexOf("{");
        const close = statement.indexOf("}", open + 1);
        if (open === -1 || close === -1) {
          return statement;
        }
        const before = statement.slice(0, open + 1);
        const inside = statement.slice(open + 1, close);
        const after = statement.slice(close);
        const parts = inside
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
        if (parts.length <= 1) {
          return statement;
        }
        const sorted = parts
          .slice()
          .sort((a, b) => {
            const keyA = sortSpecifierKey(a);
            const keyB = sortSpecifierKey(b);
            return keyA.localeCompare(keyB);
          })
          .join(", ");
        return `${before}${sorted}${after}`;
      }
    ),
};

const numericLiteralRule: NormalizerRule = {
  id: "numericLiterals",
  description: "Normalize numeric literals (separators and casing).",
  language: "*",
  safety: "aggressive",
  defaultEnabled: false,
  apply: (text) =>
    text.replace(
      /\b(?:0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?)\b/g,
      (literal: string) => normalizeNumericLiteral(literal)
    ),
};

const allRules: NormalizerRule[] = [
  whitespaceRule,
  tailwindRule,
  importOrderRule,
  numericLiteralRule,
];

function sortSpecifierKey(specifier: string) {
  const trimmed = specifier.trim();
  const withoutType = trimmed.startsWith("type ")
    ? trimmed.slice("type ".length).trim()
    : trimmed;
  const base = withoutType.split(AS_SPLIT_RE)[0]?.trim() ?? withoutType;
  return base.toLowerCase();
}

function normalizeNumericLiteral(literal: string) {
  const stripped = literal.replace(/_/g, "");
  if (stripped.startsWith("0x") || stripped.startsWith("0X")) {
    return `0x${stripped.slice(2).toLowerCase()}`;
  }
  if (stripped.startsWith("0b") || stripped.startsWith("0B")) {
    return `0b${stripped.slice(2)}`;
  }
  if (stripped.startsWith("0o") || stripped.startsWith("0O")) {
    return `0o${stripped.slice(2)}`;
  }
  const [base, exponent] = stripped.split(EXPONENT_SPLIT_RE);
  if (exponent !== undefined) {
    const normalizedExp = exponent.startsWith("+")
      ? exponent.slice(1)
      : exponent;
    return `${base}e${normalizedExp}`;
  }
  return stripped;
}

export function normalizeText(text: string, config: NormalizerConfig): string {
  return allRules.reduce((current, rule) => {
    if (!config[rule.id]) {
      return current;
    }
    return rule.apply(current);
  }, text);
}

export function resolveNormalizerConfig(
  settings: NormalizerSettings,
  language?: NormalizerLanguage
): NormalizerConfig {
  if (!language || language === "*") {
    return { ...settings.global };
  }
  const overrides = settings.perLanguage[language] ?? {};
  const sanitized: Partial<Record<keyof NormalizerConfig, boolean>> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      sanitized[key as keyof NormalizerConfig] = value;
    }
  }
  return { ...settings.global, ...sanitized };
}

export function normalizeTextForLanguage(
  text: string,
  settings: NormalizerSettings,
  language?: NormalizerLanguage
): string {
  return normalizeText(text, resolveNormalizerConfig(settings, language));
}

export function listNormalizerRules(): NormalizerRuleSummary[] {
  return allRules.map(({ apply, ...rest }) => rest);
}
