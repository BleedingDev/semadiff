export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogSink = (level: LogLevel, args: readonly unknown[]) => void;

let sink: LogSink | null = null;

const isDev = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

const shouldLog = (level: LogLevel) => level !== "debug" || isDev;

const emit = (level: LogLevel, args: readonly unknown[]) => {
  if (sink) {
    sink(level, args);
    return;
  }
  if (!shouldLog(level) || typeof console === "undefined") {
    return;
  }
  let method: (...args: unknown[]) => void;
  switch (level) {
    case "debug":
      method = console.debug;
      break;
    case "info":
      method = console.info;
      break;
    case "warn":
      method = console.warn;
      break;
    default:
      method = console.error;
  }
  method(...(args as unknown[]));
};

export const setLoggerSink = (next: LogSink | null) => {
  sink = next;
};

export const logger = {
  debug: (...args: readonly unknown[]) => emit("debug", args),
  info: (...args: readonly unknown[]) => emit("info", args),
  warn: (...args: readonly unknown[]) => emit("warn", args),
  error: (...args: readonly unknown[]) => emit("error", args),
};

export type Logger = typeof logger;
