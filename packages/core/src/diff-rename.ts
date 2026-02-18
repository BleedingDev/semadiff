export interface RenameGroup {
  id: string;
  from: string;
  to: string;
  occurrences: number;
  confidence: number;
}

export function detectRenames(oldText: string, newText: string): RenameGroup[] {
  const oldTokens = oldText.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const newTokens = newText.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  if (oldTokens.length === 0 || oldTokens.length !== newTokens.length) {
    return [];
  }

  const mappingCounts = new Map<string, number>();
  for (let i = 0; i < oldTokens.length; i += 1) {
    const from = oldTokens[i];
    const to = newTokens[i];
    if (from !== to) {
      const key = `${from}->${to}`;
      mappingCounts.set(key, (mappingCounts.get(key) ?? 0) + 1);
    }
  }

  const results: RenameGroup[] = [];
  for (const [key, count] of mappingCounts.entries()) {
    if (count < 2) {
      continue;
    }
    const separatorIndex = key.indexOf("->");
    const from = key.slice(0, separatorIndex);
    const to = key.slice(separatorIndex + 2);
    results.push({
      id: `rename-${results.length + 1}`,
      from,
      to,
      occurrences: count,
      confidence: count / oldTokens.length,
    });
  }
  return results;
}
