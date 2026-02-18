import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Effect } from "effect";
import { describe, expect, test, vi } from "vitest";
import { Telemetry, TelemetryLive } from "../src/telemetry";

interface CapturedRequest {
  url: string;
  body: string;
}

interface OTelSpanPayload {
  resourceSpans?: Array<{
    scopeSpans?: Array<{
      spans?: Array<{
        attributes?: Array<{
          key?: string;
          value?: {
            stringValue?: string;
            boolValue?: boolean;
            intValue?: string;
            doubleValue?: number;
          };
        }>;
      }>;
    }>;
  }>;
}

async function createTelemetryServer() {
  const requests: CapturedRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => {
      requests.push({
        url: req.url ?? "",
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.statusCode = 200;
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  const endpoint = `http://127.0.0.1:${address.port}/v1/traces`;
  return {
    endpoint,
    getRequests: () => requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

describe("telemetry exporter", () => {
  test("disabled telemetry does not call fetch", async () => {
    const server = await createTelemetryServer();

    const program = Effect.gen(function* () {
      const telemetry = yield* Telemetry;
      return yield* telemetry.span("run", {}, Effect.succeed("ok"));
    });
    await Effect.runPromise(
      program.pipe(
        Effect.provide(
          TelemetryLive({
            enabled: false,
            exporter: "otlp-http",
            endpoint: server.endpoint,
          })
        )
      )
    );

    expect(server.getRequests()).toHaveLength(0);
    await server.close();
  });

  test("enabled telemetry calls fetch for otlp exporter", async () => {
    const server = await createTelemetryServer();

    const program = Effect.gen(function* () {
      const telemetry = yield* Telemetry;
      return yield* telemetry.span(
        "run",
        { command: "diff" },
        Effect.succeed("ok")
      );
    });
    await Effect.runPromise(
      program.pipe(
        Effect.provide(
          TelemetryLive({
            enabled: true,
            exporter: "otlp-http",
            endpoint: server.endpoint,
          })
        )
      )
    );

    expect(server.getRequests().length).toBeGreaterThan(0);
    await server.close();
  });

  test("log and metric exports derive OTLP endpoints", async () => {
    const server = await createTelemetryServer();

    const program = Effect.gen(function* () {
      const telemetry = yield* Telemetry;
      yield* telemetry.log("hello", { scope: "test" });
      yield* telemetry.metric("semadiff.metric", 1, { scope: "test" });
    });

    await Effect.runPromise(
      program.pipe(
        Effect.provide(
          TelemetryLive({
            enabled: true,
            exporter: "otlp-http",
            endpoint: server.endpoint,
          })
        )
      )
    );

    const urls = server.getRequests().map((request) => request.url);
    expect(urls).toContain("/v1/logs");
    expect(urls).toContain("/v1/metrics");
    expect(server.getRequests().length).toBeGreaterThan(1);
    await server.close();
  });

  test("failed spans export semadiff.status=error", async () => {
    const server = await createTelemetryServer();

    const program = Effect.gen(function* () {
      const telemetry = yield* Telemetry;
      return yield* Effect.result(
        telemetry.span("run", { command: "diff" }, Effect.fail("boom"))
      );
    });

    await Effect.runPromise(
      program.pipe(
        Effect.provide(
          TelemetryLive({
            enabled: true,
            exporter: "otlp-http",
            endpoint: server.endpoint,
          })
        )
      )
    );

    const traceRequest = server
      .getRequests()
      .find((request) => request.url === "/v1/traces");
    expect(traceRequest).toBeDefined();
    if (traceRequest) {
      const payload = JSON.parse(traceRequest.body) as OTelSpanPayload;
      const attributes =
        payload.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0]?.attributes ??
        [];
      const status = attributes.find(
        (attribute) => attribute.key === "semadiff.status"
      );
      expect(status?.value?.stringValue).toBe("error");
    }
    await server.close();
  });

  test("missing endpoint warns once and skips otlp exports", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const program = Effect.gen(function* () {
      const telemetry = yield* Telemetry;
      yield* telemetry.span("run", {}, Effect.succeed("ok"));
      yield* telemetry.log("hello");
      yield* telemetry.metric("metric", 1);
      yield* telemetry.span("run-2", {}, Effect.succeed("ok"));
    });

    await Effect.runPromise(
      program.pipe(
        Effect.provide(
          TelemetryLive({
            enabled: true,
            exporter: "otlp-http",
            endpoint: undefined,
          })
        )
      )
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0] ?? "")).toContain(
      "without endpoint"
    );
    warnSpy.mockRestore();
  });

  test("deriveEndpoint appends v1 paths for base OTLP endpoint", async () => {
    const server = await createTelemetryServer();
    const baseEndpoint = server.endpoint.replace("/v1/traces", "/collector");

    const program = Effect.gen(function* () {
      const telemetry = yield* Telemetry;
      yield* telemetry.log("hello");
      yield* telemetry.metric("semadiff.metric", 1);
    });

    await Effect.runPromise(
      program.pipe(
        Effect.provide(
          TelemetryLive({
            enabled: true,
            exporter: "otlp-http",
            endpoint: baseEndpoint,
          })
        )
      )
    );

    const urls = server.getRequests().map((request) => request.url);
    expect(urls).toContain("/collector/v1/logs");
    expect(urls).toContain("/collector/v1/metrics");
    await server.close();
  });

  test("encodes mixed attribute types into OTLP payload", async () => {
    const server = await createTelemetryServer();

    const program = Effect.gen(function* () {
      const telemetry = yield* Telemetry;
      yield* telemetry.span(
        "mixed",
        {
          command: "diff",
          ok: true,
          count: 3,
          ratio: 1.5,
          nested: { key: "value" },
          skip: undefined,
        },
        Effect.succeed("ok")
      );
    });

    await Effect.runPromise(
      program.pipe(
        Effect.provide(
          TelemetryLive({
            enabled: true,
            exporter: "otlp-http",
            endpoint: server.endpoint,
          })
        )
      )
    );

    const traceRequest = server
      .getRequests()
      .find((request) => request.url === "/v1/traces");
    expect(traceRequest).toBeDefined();
    if (traceRequest) {
      const payload = JSON.parse(traceRequest.body) as OTelSpanPayload;
      const attributes =
        payload.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0]?.attributes ??
        [];
      const byKey = new Map(
        attributes.map((attribute) => [attribute.key, attribute.value])
      );
      expect(byKey.get("command")?.stringValue).toBe("diff");
      expect(byKey.get("ok")?.boolValue).toBe(true);
      expect(byKey.get("count")?.intValue).toBe("3");
      expect(byKey.get("ratio")?.doubleValue).toBe(1.5);
      expect(byKey.get("nested")?.stringValue).toContain('"key":"value"');
      expect(byKey.has("skip")).toBe(false);
    }
    await server.close();
  });
});
