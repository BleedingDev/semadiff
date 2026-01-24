export type BlobResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

export async function fetchBlob(url?: string): Promise<BlobResult> {
  if (!url) {
    return { ok: false, error: "Missing blob URL" };
  }

  try {
    const response = await fetch(url, {
      credentials: "include",
      redirect: "follow",
    });
    if (!response.ok) {
      return { ok: false, error: `Blob fetch failed (${response.status})` };
    }
    const lengthHeader = response.headers.get("content-length");
    if (lengthHeader) {
      const length = Number.parseInt(lengthHeader, 10);
      if (Number.isFinite(length) && length > 1_000_000) {
        return { ok: false, error: "Blob exceeds 1MB limit" };
      }
    }
    const content = await response.text();
    if (content.length > 1_000_000) {
      return { ok: false, error: "Blob exceeds 1MB limit" };
    }
    return { ok: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}
