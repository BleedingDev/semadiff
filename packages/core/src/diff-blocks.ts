import type { DiffToken } from "./diff-tokenize.js";

export interface UnitBlock {
  type: "delete" | "insert";
  start: number;
  units: DiffToken[];
}

interface ArrayEdit {
  type: "equal" | "delete" | "insert";
}

const MAX_LCS_CELLS = 2_000_000;

function selectPrevK(v: number[], offset: number, k: number, d: number) {
  const left = v[offset + k - 1] ?? 0;
  const right = v[offset + k + 1] ?? 0;
  if (k === -d || (k !== d && left < right)) {
    return k + 1;
  }
  return k - 1;
}

function backtrackArrayEdits(
  trace: number[][],
  _oldValues: string[],
  _newValues: string[],
  n: number,
  m: number
): ArrayEdit[] {
  let x = n;
  let y = m;
  const edits: ArrayEdit[] = [];

  for (let d = trace.length - 1; d > 0; d -= 1) {
    const v = trace[d];
    if (!v) {
      continue;
    }
    const offset = (v.length - 1) / 2;
    const k = x - y;
    const prevK = selectPrevK(v, offset, k, d);
    const prevX = v[offset + prevK] ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      edits.unshift({ type: "equal" });
      x -= 1;
      y -= 1;
    }

    if (x === prevX && y > prevY) {
      edits.unshift({ type: "insert" });
      y -= 1;
    } else if (y === prevY && x > prevX) {
      edits.unshift({ type: "delete" });
      x -= 1;
    }
  }

  while (x > 0 && y > 0) {
    edits.unshift({ type: "equal" });
    x -= 1;
    y -= 1;
  }
  while (x > 0) {
    edits.unshift({ type: "delete" });
    x -= 1;
  }
  while (y > 0) {
    edits.unshift({ type: "insert" });
    y -= 1;
  }

  return edits;
}

function diffArrayEdits(oldValues: string[], newValues: string[]) {
  const n = oldValues.length;
  const m = newValues.length;
  const max = n + m;
  const offset = max;
  const v = new Array(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d += 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      const left = v[offset + k - 1] ?? 0;
      const right = v[offset + k + 1] ?? 0;
      if (k === -d || (k !== d && left < right)) {
        x = right;
      } else {
        x = left + 1;
      }
      let y = x - k;
      while (x < n && y < m && oldValues[x] === newValues[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        return backtrackArrayEdits(trace, oldValues, newValues, n, m);
      }
    }
  }

  return backtrackArrayEdits(trace, oldValues, newValues, n, m);
}

function getComparableText(unit: DiffToken) {
  return unit.compareText ?? unit.text;
}

function buildLcsTable(oldUnits: DiffToken[], newUnits: DiffToken[]) {
  const table = Array.from({ length: oldUnits.length + 1 }, () =>
    new Array(newUnits.length + 1).fill(0)
  );
  for (let i = oldUnits.length - 1; i >= 0; i -= 1) {
    for (let j = newUnits.length - 1; j >= 0; j -= 1) {
      const oldUnit = oldUnits[i];
      const newUnit = newUnits[j];
      const row = table[i];
      const downRow = table[i + 1];
      if (!(oldUnit && newUnit)) {
        continue;
      }
      if (!(row && downRow)) {
        continue;
      }
      if (getComparableText(oldUnit) === getComparableText(newUnit)) {
        row[j] = (downRow[j + 1] ?? 0) + 1;
      } else {
        row[j] = Math.max(downRow[j] ?? 0, row[j + 1] ?? 0);
      }
    }
  }
  return table;
}

function diffUnitsMyers(oldUnits: DiffToken[], newUnits: DiffToken[]) {
  const oldValues = oldUnits.map(getComparableText);
  const newValues = newUnits.map(getComparableText);
  const edits = diffArrayEdits(oldValues, newValues);
  const blocks: UnitBlock[] = [];

  const pushBlock = (
    type: UnitBlock["type"],
    start: number,
    unit: DiffToken
  ) => {
    const last = blocks.at(-1);
    if (
      last &&
      last.type === type &&
      last.start + last.units.length === start
    ) {
      last.units.push(unit);
      return;
    }
    blocks.push({ type, start, units: [unit] });
  };

  let oldIndex = 0;
  let newIndex = 0;
  for (const edit of edits) {
    if (edit.type === "equal") {
      oldIndex += 1;
      newIndex += 1;
      continue;
    }
    if (edit.type === "delete") {
      const unit = oldUnits[oldIndex];
      if (unit) {
        pushBlock("delete", oldIndex, unit);
      }
      oldIndex += 1;
      continue;
    }
    const unit = newUnits[newIndex];
    if (unit) {
      pushBlock("insert", newIndex, unit);
    }
    newIndex += 1;
  }

  return blocks;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: diff algorithm balances readability and behavior.
export function diffUnits(
  oldUnits: DiffToken[],
  newUnits: DiffToken[]
): UnitBlock[] {
  if (oldUnits.length * newUnits.length > MAX_LCS_CELLS) {
    return diffUnitsMyers(oldUnits, newUnits);
  }
  const table = buildLcsTable(oldUnits, newUnits);
  const blocks: UnitBlock[] = [];

  const pushBlock = (
    type: UnitBlock["type"],
    start: number,
    unit: DiffToken
  ) => {
    const last = blocks.at(-1);
    if (
      last &&
      last.type === type &&
      last.start + last.units.length === start
    ) {
      last.units.push(unit);
      return;
    }
    blocks.push({ type, start, units: [unit] });
  };

  let i = 0;
  let j = 0;
  while (i < oldUnits.length || j < newUnits.length) {
    const hasOld = i < oldUnits.length;
    const hasNew = j < newUnits.length;
    const oldUnit = hasOld ? oldUnits[i] : undefined;
    const newUnit = hasNew ? newUnits[j] : undefined;
    if (
      oldUnit &&
      newUnit &&
      getComparableText(oldUnit) === getComparableText(newUnit)
    ) {
      i += 1;
      j += 1;
      continue;
    }
    const down = table[i + 1]?.[j] ?? 0;
    const right = table[i]?.[j + 1] ?? 0;
    if (!hasNew || (oldUnit && down >= right)) {
      if (oldUnit) {
        pushBlock("delete", i, oldUnit);
      }
      i += 1;
    } else {
      if (newUnit) {
        pushBlock("insert", j, newUnit);
      }
      j += 1;
    }
  }

  return blocks;
}
