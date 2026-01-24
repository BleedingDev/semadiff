import { execSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";

const distContentPath = join(
  process.cwd(),
  "packages",
  "github-extension",
  "dist",
  "content.js"
);
const srcRoot = join(process.cwd(), "packages", "github-extension", "src");
const lockPath = join(process.cwd(), ".cache", "extension-build.lock");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForBuild(timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!existsSync(lockPath) && existsSync(distContentPath)) {
      return;
    }
    await wait(200);
  }
  throw new Error("Timed out waiting for extension build to finish.");
}

function getLatestMtime(dir: string): number {
  let latest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      latest = Math.max(latest, getLatestMtime(fullPath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    latest = Math.max(latest, statSync(fullPath).mtimeMs);
  }
  return latest;
}

function needsRebuild() {
  if (!existsSync(distContentPath)) {
    return true;
  }
  const distMtime = statSync(distContentPath).mtimeMs;
  const srcMtime = getLatestMtime(srcRoot);
  return srcMtime > distMtime;
}

export async function ensureExtensionBuilt() {
  if (!(needsRebuild() || existsSync(lockPath))) {
    return;
  }

  mkdirSync(dirname(lockPath), { recursive: true });

  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      try {
        execSync("pnpm --filter @semadiff/github-extension build", {
          stdio: "inherit",
        });
      } finally {
        closeSync(fd);
        try {
          unlinkSync(lockPath);
        } catch {
          // Lock might be cleared by a failing build; ignore cleanup errors.
        }
      }
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      await waitForBuild(120_000);
      if (existsSync(distContentPath)) {
        return;
      }
    }
  }
}
