import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer, ServiceMap } from "effect";
import { adjust, layer as testClockLayer } from "effect/testing/TestClock";

const HarnessService = ServiceMap.Service<{
  readonly ping: Effect.Effect<"pong">;
  readonly fail: Effect.Effect<never, "boom">;
}>("HarnessService");

const HarnessLayer = Layer.succeed(HarnessService, {
  ping: Effect.succeed("pong" as const),
  fail: Effect.fail("boom" as const),
});

describe("effect testing harness", () => {
  it.effect("provides ServiceMap service dependencies", () =>
    Effect.gen(function* () {
      const response = yield* HarnessService.use((service) => service.ping);
      expect(response).toBe("pong");
    }).pipe(Effect.provide(HarnessLayer), Effect.provide(testClockLayer()))
  );

  it.effect("supports TestClock scheduling", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        Effect.as(Effect.sleep("1 second"), "done")
      );
      yield* adjust("1 second");
      const value = yield* Fiber.join(fiber);
      expect(value).toBe("done");
    }).pipe(Effect.provide(testClockLayer()))
  );

  it.effect("propagates typed service failures", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        HarnessService.use((service) => service.fail)
      );
      expect(error).toBe("boom");
    }).pipe(Effect.provide(HarnessLayer), Effect.provide(testClockLayer()))
  );
});
