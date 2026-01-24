import type { PrRef } from "./types.js";

const GITHUB_PR_REGEX =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i;
const LEADING_SLASH_RE = /^\/+/;

export function parsePrUrl(input: string): PrRef | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.startsWith("http")
    ? trimmed
    : `https://github.com/${trimmed.replace(LEADING_SLASH_RE, "")}`;
  const match = normalized.match(GITHUB_PR_REGEX);
  if (!match) {
    return null;
  }
  const [, owner, repo, number] = match;
  if (!(owner && repo && number)) {
    return null;
  }
  return { owner, repo, number: Number(number) };
}
