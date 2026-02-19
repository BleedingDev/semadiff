import { Effect, FileSystem, Layer, Path, Terminal } from "effect";
import {
  ChildProcessSpawner,
  type ChildProcessSpawner as ChildProcessSpawnerService,
} from "effect/unstable/process/ChildProcessSpawner";

export const UNSUPPORTED_TERMINAL_READ_INPUT_MESSAGE =
  "Terminal.readInput is not supported in semadiff CLI runtime";
export const UNSUPPORTED_CHILD_PROCESS_SPAWN_MESSAGE =
  "ChildProcessSpawner.spawn is not supported in semadiff CLI runtime";

const terminal = Terminal.make({
  columns: Effect.sync(() => process.stdout.columns ?? 80),
  display: (text) =>
    Effect.sync(() => {
      process.stdout.write(text);
    }),
  readLine: Effect.fail(new Terminal.QuitError({})),
  readInput: Effect.die(UNSUPPORTED_TERMINAL_READ_INPUT_MESSAGE),
});

const childProcessSpawner: ChildProcessSpawnerService = {
  spawn: () => Effect.die(UNSUPPORTED_CHILD_PROCESS_SPAWN_MESSAGE),
};

export const cliRuntimeLayer = Layer.mergeAll(
  Path.layer,
  FileSystem.layerNoop({}),
  Layer.succeed(Terminal.Terminal, terminal),
  Layer.succeed(ChildProcessSpawner, childProcessSpawner)
);
