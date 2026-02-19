import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Terminal } from "effect";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import {
  cliRuntimeLayer,
  UNSUPPORTED_CHILD_PROCESS_SPAWN_MESSAGE,
  UNSUPPORTED_TERMINAL_READ_INPUT_MESSAGE,
} from "../src/runtime-layer.js";

describe("cli runtime layer", () => {
  it.effect("readLine fails with QuitError", () =>
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal;
      const error = yield* Effect.flip(terminal.readLine);
      expect(Terminal.isQuitError(error)).toBe(true);
    }).pipe(Effect.provide(cliRuntimeLayer))
  );

  it.effect("readInput fails with explicit unsupported message", () =>
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal;
      const exit = yield* Effect.exit(terminal.readInput);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.pretty(exit.cause)).toContain(
          UNSUPPORTED_TERMINAL_READ_INPUT_MESSAGE
        );
      }
    }).pipe(Effect.provide(cliRuntimeLayer))
  );

  it.effect("spawn fails with explicit unsupported message", () =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      const command = ChildProcess.make`echo semadiff`;
      const exit = yield* Effect.scoped(Effect.exit(spawner.spawn(command)));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.pretty(exit.cause)).toContain(
          UNSUPPORTED_CHILD_PROCESS_SPAWN_MESSAGE
        );
      }
    }).pipe(Effect.provide(cliRuntimeLayer))
  );
});
