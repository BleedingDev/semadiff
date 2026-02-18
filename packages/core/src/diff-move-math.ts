import type { DiffToken } from "./diff-tokenize.js";

export function getComparableText(unit: DiffToken) {
  return unit.compareText ?? unit.text;
}

function lcsLength(a: string[], b: string[]) {
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
      } else {
        dp[j] = Math.max(dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[b.length] ?? 0;
}

export function similarityRatio(a: string[], b: string[]) {
  if (a.length === 0 && b.length === 0) {
    return 1;
  }
  const common = lcsLength(a, b);
  return common / Math.max(a.length, b.length, 1);
}

export function normalizeMoveUnits(units: DiffToken[]) {
  return units.filter((unit) => getComparableText(unit).trim().length > 0);
}

export function moveUnitTextLength(units: DiffToken[]) {
  return units.reduce(
    (sum, unit) => sum + getComparableText(unit).trim().length,
    0
  );
}
