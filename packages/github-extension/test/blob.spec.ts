import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, test } from "vitest";
import { fetchBlob } from "../src/blob";

async function createBlobServer(options: {
  body: string;
  contentLengthHeader?: string;
  statusCode?: number;
}) {
  const server = createServer((_req, res) => {
    if (options.contentLengthHeader) {
      res.setHeader("content-length", options.contentLengthHeader);
    }
    res.statusCode = options.statusCode ?? 200;
    res.end(options.body);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/blob`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

describe("fetchBlob", () => {
  test("returns error for missing URL", async () => {
    const result = await fetchBlob(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Missing blob URL");
    }
  });

  test("rejects blobs over size limit via content-length", async () => {
    const server = await createBlobServer({
      body: "ok",
      contentLengthHeader: "1000001",
    });

    const result = await fetchBlob(server.url);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("1MB");
    }

    await server.close();
  });

  test("rejects blobs over size limit via body length", async () => {
    const largePayload = "a".repeat(1_000_001);
    const server = await createBlobServer({ body: largePayload });

    const result = await fetchBlob(server.url);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("1MB");
    }

    await server.close();
  });

  test("returns status error when request is not successful", async () => {
    const server = await createBlobServer({
      body: "not found",
      statusCode: 404,
    });

    const result = await fetchBlob(server.url);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("404");
    }

    await server.close();
  });

  test("returns content when blob fetch succeeds", async () => {
    const server = await createBlobServer({
      body: "hello blob",
      contentLengthHeader: "10",
    });

    const result = await fetchBlob(server.url);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe("hello blob");
    }

    await server.close();
  });

  test("returns thrown fetch error message", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error("network exploded"));

    try {
      const result = await fetchBlob("http://example.test/blob");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("network exploded");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
