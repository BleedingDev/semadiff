import type { PrRef } from "./types";

const GITHUB_PR_REGEX =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i;

export function parsePrUrl(input: string): PrRef | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.startsWith("http")
    ? trimmed
    : `https://github.com/${trimmed.replace(/^\/+/, "")}`;
  const match = normalized.match(GITHUB_PR_REGEX);
  if (!match) {
    return null;
  }
  const [, owner, repo, number] = match;
  if (!owner || !repo || !number) {
    return null;
  }
  return { owner, repo, number: Number(number) };
}
