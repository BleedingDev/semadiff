import { describe, expect, test } from "vitest";
import { structuralDiff } from "../src/diff";

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d_2b_79_f5;
    // biome-ignore lint/suspicious/noBitwiseOperators: deterministic PRNG uses bitwise ops.
    let result = Math.imul(t ^ (t >>> 15), t | 1);
    // biome-ignore lint/suspicious/noBitwiseOperators: deterministic PRNG uses bitwise ops.
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    // biome-ignore lint/suspicious/noBitwiseOperators: deterministic PRNG uses bitwise ops.
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomString(rng: () => number, length: number) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ \n";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(rng() * chars.length)];
  }
  return result;
}

describe("fuzz: structuralDiff stability", () => {
  test("random inputs do not crash and are deterministic", () => {
    const rng = mulberry32(1337);
    for (let i = 0; i < 25; i += 1) {
      const oldText = randomString(rng, 64);
      const newText = randomString(rng, 64);
      const first = structuralDiff(oldText, newText);
      const second = structuralDiff(oldText, newText);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    }
  });
});
