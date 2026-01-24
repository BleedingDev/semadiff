import { Effect, Exit, Layer, Schema } from "effect";

export type TelemetryAttributes = Record<string, unknown>;

export interface TelemetryService {
  span: <A, E, R>(
    name: string,
    attributes: TelemetryAttributes,
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>;
  log: (
    message: string,
    attributes?: TelemetryAttributes
  ) => Effect.Effect<void, never>;
  metric: (
    name: string,
    value: number,
    attributes?: TelemetryAttributes
  ) => Effect.Effect<void, never>;
}

const TelemetryNoop: TelemetryService = {
  span: (_name, _attributes, effect) => effect,
  log: () => Effect.void,
  metric: () => Effect.void,
};

export class Telemetry extends Effect.Service<Telemetry>()(
  "@semadiff/Telemetry",
  {
    sync: () => TelemetryNoop,
  }
) {}

export interface TelemetryOptions {
  enabled: boolean;
  exporter: "console" | "otlp-http" | "otlp-grpc";
  endpoint?: string;
}

type OTelAttributeValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number };

interface OTelAttribute {
  key: string;
  value: OTelAttributeValue;
}

const JsonUnknown = Schema.parseJson(Schema.Unknown);
const encodeJson = (value: unknown) =>
  Schema.encode(JsonUnknown)(value).pipe(Effect.orDie);
const encodeJsonSync = (value: unknown) => {
  try {
    return Schema.encodeSync(JsonUnknown)(value);
  } catch (error) {
    return String(error);
  }
};

function toAttributeValue(value: unknown): OTelAttributeValue {
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "boolean") {
    return { boolValue: value };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { intValue: String(value) };
    }
    return { doubleValue: value };
  }
  return { stringValue: encodeJsonSync(value) };
}

function toOtelAttributes(attributes: TelemetryAttributes): OTelAttribute[] {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value: toAttributeValue(value) }));
}

function buildOtelPayload(params: {
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: TelemetryAttributes;
  status: "ok" | "error";
}) {
  const attributes: OTelAttribute[] = [
    { key: "semadiff.status", value: { stringValue: params.status } },
    ...toOtelAttributes(params.attributes),
  ];

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "semadiff" } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "semadiff" },
            spans: [
              {
                name: params.name,
                startTimeUnixNano: params.startTimeUnixNano,
                endTimeUnixNano: params.endTimeUnixNano,
                attributes,
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildOtelLogPayload(params: {
  message: string;
  timeUnixNano: string;
  attributes: TelemetryAttributes;
}) {
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "semadiff" } },
          ],
        },
        scopeLogs: [
          {
            scope: { name: "semadiff" },
            logRecords: [
              {
                timeUnixNano: params.timeUnixNano,
                body: { stringValue: params.message },
                attributes: toOtelAttributes(params.attributes),
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildOtelMetricPayload(params: {
  name: string;
  timeUnixNano: string;
  value: number;
  attributes: TelemetryAttributes;
}) {
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "semadiff" } },
          ],
        },
        scopeMetrics: [
          {
            scope: { name: "semadiff" },
            metrics: [
              {
                name: params.name,
                sum: {
                  aggregationTemporality: 2,
                  isMonotonic: false,
                  dataPoints: [
                    {
                      timeUnixNano: params.timeUnixNano,
                      attributes: toOtelAttributes(params.attributes),
                      asDouble: params.value,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function deriveEndpoint(base: string, kind: "traces" | "logs" | "metrics") {
  if (base.includes("/v1/traces")) {
    return base.replace("/v1/traces", `/v1/${kind}`);
  }
  if (base.endsWith("/")) {
    return `${base}v1/${kind}`;
  }
  return `${base}/v1/${kind}`;
}

export function TelemetryLive(options: TelemetryOptions) {
  let warned = false;
  let warnedGrpc = false;
  const warnOnce = (message: string) => {
    if (!warned) {
      warned = true;
      console.warn(message);
    }
  };
  const warnGrpcOnce = () => {
    if (!warnedGrpc) {
      warnedGrpc = true;
      console.warn("OTLP gRPC exporter is using HTTP JSON fallback.");
    }
  };
  const resolveEndpoint = () => {
    if (!options.endpoint) {
      warnOnce(
        "Telemetry exporter enabled without endpoint; skipping OTLP export."
      );
      return null;
    }
    if (typeof fetch !== "function") {
      warnOnce("Telemetry exporter requires fetch; skipping OTLP export.");
      return null;
    }
    return options.endpoint;
  };
  const exportSpan = (params: {
    name: string;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
    attributes: TelemetryAttributes;
    status: "ok" | "error";
    durationMs: number;
  }) => {
    if (options.exporter === "console") {
      return Effect.gen(function* () {
        const payload = {
          span: params.name,
          durationMs: params.durationMs,
          attributes: params.attributes,
          status: params.status,
        };
        const json = yield* encodeJson(payload);
        console.log(json);
      });
    }
    const endpoint = resolveEndpoint();
    if (!endpoint) {
      return Effect.void;
    }
    if (options.exporter === "otlp-grpc") {
      warnGrpcOnce();
    }
    const payload = buildOtelPayload(params);
    return encodeJson(payload).pipe(
      Effect.flatMap((body) =>
        Effect.tryPromise((signal) =>
          fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body,
            signal,
          })
        )
      ),
      Effect.ignore
    );
  };

  return Layer.succeed(
    Telemetry,
    Telemetry.make({
      span: <A, E, R>(
        name: string,
        attributes: TelemetryAttributes,
        effect: Effect.Effect<A, E, R>
      ) =>
        Effect.gen(function* () {
          if (!options.enabled) {
            return yield* effect;
          }
          const start = Date.now();
          const startNs = String(start * 1_000_000);
          const handleExit = (exit: Exit.Exit<A, E>) => {
            const end = Date.now();
            const endNs = String(end * 1_000_000);
            const durationMs = end - start;
            const status = Exit.isFailure(exit) ? "error" : "ok";
            return exportSpan({
              name,
              startTimeUnixNano: startNs,
              endTimeUnixNano: endNs,
              attributes,
              status,
              durationMs,
            });
          };
          return yield* effect.pipe(Effect.onExit(handleExit));
        }),
      log: (message: string, attributes: TelemetryAttributes = {}) =>
        Effect.gen(function* () {
          if (!options.enabled) {
            return;
          }
          const timestamp = String(Date.now() * 1_000_000);
          if (options.exporter === "console") {
            const json = yield* encodeJson({
              log: message,
              timestamp,
              attributes,
            });
            console.log(json);
            return;
          }
          const endpoint = resolveEndpoint();
          if (!endpoint) {
            return;
          }
          const payload = buildOtelLogPayload({
            message,
            timeUnixNano: timestamp,
            attributes,
          });
          const endpointUrl = deriveEndpoint(endpoint, "logs");
          const body = yield* encodeJson(payload);
          yield* Effect.ignore(
            Effect.tryPromise((signal) =>
              fetch(endpointUrl, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                },
                body,
                signal,
              })
            )
          );
        }),
      metric: (
        name: string,
        value: number,
        attributes: TelemetryAttributes = {}
      ) =>
        Effect.gen(function* () {
          if (!options.enabled) {
            return;
          }
          const timestamp = String(Date.now() * 1_000_000);
          if (options.exporter === "console") {
            const json = yield* encodeJson({
              metric: name,
              value,
              timestamp,
              attributes,
            });
            console.log(json);
            return;
          }
          const endpoint = resolveEndpoint();
          if (!endpoint) {
            return;
          }
          const payload = buildOtelMetricPayload({
            name,
            timeUnixNano: timestamp,
            value,
            attributes,
          });
          const endpointUrl = deriveEndpoint(endpoint, "metrics");
          const body = yield* encodeJson(payload);
          yield* Effect.ignore(
            Effect.tryPromise((signal) =>
              fetch(endpointUrl, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                },
                body,
                signal,
              })
            )
          );
        }),
    })
  );
}
