import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, test } from "vitest";
import { fetchBlob } from "../src/blob";

async function createBlobServer(options: {
  body: string;
  contentLengthHeader?: string;
}) {
  const server = createServer((_req, res) => {
    if (options.contentLengthHeader) {
      res.setHeader("content-length", options.contentLengthHeader);
    }
    res.statusCode = 200;
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
});
