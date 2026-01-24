# Configuration

SemaDiff reads configuration from (lowest to highest priority):

1. Built-in defaults
2. Project config: `./semadiff.config.json`
3. User config: `~/.config/semadiff/config.json`
4. Environment variables

The CLI command `semadiff config` prints the resolved config plus provenance for each field.

## JSON Config Shape

```json
{
  "normalizers": {
    "global": {
      "whitespace": true,
      "tailwind": true,
      "importOrder": false,
      "numericLiterals": false
    },
    "perLanguage": {
      "tsx": {
        "tailwind": true
      }
    }
  },
  "renderer": {
    "format": "ansi",
    "layout": "unified"
  },
  "telemetry": {
    "enabled": false,
    "exporter": "console",
    "endpoint": "http://127.0.0.1:4318/v1/traces"
  }
}
```

All fields are optional; missing values fall back to defaults.

## Environment Variables

- `SEMADIFF_NORMALIZER_WHITESPACE` = `true|false`
- `SEMADIFF_NORMALIZER_TAILWIND` = `true|false`
- `SEMADIFF_NORMALIZER_IMPORT_ORDER` = `true|false`
- `SEMADIFF_NORMALIZER_NUMERIC_LITERALS` = `true|false`
- `SEMADIFF_RENDERER_FORMAT` = `ansi|plain|json`
- `SEMADIFF_RENDERER_LAYOUT` = `unified|side-by-side`
- `SEMADIFF_TELEMETRY_ENABLED` = `true|false`
- `SEMADIFF_TELEMETRY_EXPORTER` = `console|otlp-http|otlp-grpc`
- `SEMADIFF_TELEMETRY_ENDPOINT` = `http://127.0.0.1:4318/v1/traces`

## Notes

- Telemetry exporters are opt-in; the default is console-only with no network.
- Logs/metrics export uses the same endpoint base, with `/v1/logs` and `/v1/metrics` derived from the traces endpoint.
- `otlp-grpc` currently uses the same HTTP JSON payload as `otlp-http`.
- Per-language normalizer overrides merge on top of the global normalizer flags.
