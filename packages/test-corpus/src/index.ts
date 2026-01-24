import { fileURLToPath } from "node:url";

export const packageName = "@semadiff/test-corpus";

export interface Fixture {
  id: string;
  language: string;
  description: string;
  oldPath: string;
  newPath: string;
}

const baseUrl = new URL("../fixtures/", import.meta.url);

function resolveFixture(path: string) {
  return fileURLToPath(new URL(path, baseUrl));
}

const fixtures: Fixture[] = [
  {
    id: "tailwind-reorder",
    language: "tsx",
    description: "Tailwind class reorder should normalize.",
    oldPath: resolveFixture("tailwind/old.tsx"),
    newPath: resolveFixture("tailwind/new.tsx"),
  },
  {
    id: "move-block",
    language: "ts",
    description: "Moved block with minor edit.",
    oldPath: resolveFixture("move/old.ts"),
    newPath: resolveFixture("move/new.ts"),
  },
];

export function listFixtures() {
  return fixtures.slice();
}
