import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";
import { Telemetry, TelemetryLive } from "../src/telemetry";

async function createTelemetryServer() {
  let count = 0;
  const server = createServer((req, res) => {
    count += 1;
    req.on("data", () => undefined);
    req.on("end", () => {
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
    getCount: () => count,
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

    expect(server.getCount()).toBe(0);
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

    expect(server.getCount()).toBeGreaterThan(0);
    await server.close();
  });

  test("log and metric exports call fetch", async () => {
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

    expect(server.getCount()).toBeGreaterThan(1);
    await server.close();
  });
});
