import { Effect, Fiber, Layer, ServiceMap } from "effect";
import { adjust, layer as testClockLayer } from "effect/testing/TestClock";
import { describe, expect, it } from "vitest";

const HarnessService = ServiceMap.Service<{
  readonly ping: Effect.Effect<"pong">;
  readonly fail: Effect.Effect<never, "boom">;
}>("HarnessService");

const HarnessLayer = Layer.succeed(HarnessService, {
  ping: Effect.succeed("pong" as const),
  fail: Effect.fail("boom" as const),
});

describe("effect testing harness", () => {
  it("provides ServiceMap service dependencies", async () => {
    const response = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* HarnessService.use((service) => service.ping);
      }).pipe(
        Effect.scoped,
        Effect.provide(HarnessLayer),
        Effect.provide(testClockLayer())
      )
    );
    expect(response).toBe("pong");
  });

  it("supports TestClock scheduling", async () => {
    const value = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Effect.as(Effect.sleep("1 second"), "done")
        );
        yield* adjust("1 second");
        return yield* Fiber.join(fiber);
      }).pipe(Effect.scoped, Effect.provide(testClockLayer()))
    );
    expect(value).toBe("done");
  });

  it("propagates typed service failures", async () => {
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* Effect.flip(
          HarnessService.use((service) => service.fail)
        );
      }).pipe(
        Effect.scoped,
        Effect.provide(HarnessLayer),
        Effect.provide(testClockLayer())
      )
    );
    expect(error).toBe("boom");
  });
});
