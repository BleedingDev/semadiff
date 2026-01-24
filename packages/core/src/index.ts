export type {
  Config,
  ConfigInput,
  ConfigResolution,
  ConfigSource,
  ConfigSources,
  NormalizerConfig,
  NormalizerOverrides,
  NormalizerSettings,
} from "./config.js";
export {
  ConfigInputSchema,
  ConfigSchema,
  ConfigValidationError,
  decodeConfigInput,
  decodeConfigInputJson,
  defaultConfig,
  defaultSources,
  mergeConfig,
} from "./config.js";
export type { DiagnosticsBundle } from "./diagnostics.js";
export { createDiagnosticsBundle } from "./diagnostics.js";
export type {
  DiffDocument,
  DiffOperation,
  MoveGroup,
  Position,
  Range,
  RenameGroup,
} from "./diff.js";
export { structuralDiff } from "./diff.js";
export type { ExplainDocument, ExplainOperation } from "./explain.js";
export { explainDiff } from "./explain.js";
export type {
  NormalizerLanguage,
  NormalizerRule,
  NormalizerRuleSummary,
  NormalizerSafety,
} from "./normalizers.js";
export {
  listNormalizerRules,
  normalizeText,
  normalizeTextForLanguage,
} from "./normalizers.js";
export { renderJson } from "./render-json.js";
export type { TelemetryService } from "./telemetry.js";
export { Telemetry, TelemetryLive } from "./telemetry.js";
