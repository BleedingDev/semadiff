import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";
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
      return yield* telemetry
        .span("run", { command: "diff" }, Effect.fail("boom"))
        .pipe(Effect.either);
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
});
