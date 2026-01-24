import type { Register } from "@tanstack/react-router";
import type { RequestHandler } from "@tanstack/react-start/server";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";

import "./server/pr.server";

const fetch = createStartHandler(defaultStreamHandler);

export interface ServerEntry {
  fetch: RequestHandler<Register>;
}

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      return await entry.fetch(...args);
    },
  };
}

export default createServerEntry({ fetch });
