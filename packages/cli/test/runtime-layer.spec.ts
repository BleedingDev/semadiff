import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path, Terminal } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { cliRuntimeLayer } from "../src/runtime-layer.js";

describe("cli runtime layer", () => {
  it.effect("provides platform services required by unstable CLI", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const terminal = yield* Terminal.Terminal;
      const spawner = yield* ChildProcessSpawner;

      expect(typeof fileSystem.readFile).toBe("function");
      expect(typeof path.join).toBe("function");
      expect(typeof terminal.columns).toBe("object");
      expect(typeof terminal.display).toBe("function");
      expect(typeof spawner.spawn).toBe("function");
    }).pipe(Effect.provide(cliRuntimeLayer))
  );
});
