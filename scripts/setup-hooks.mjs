import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const gitDir = join(process.cwd(), ".git");

if (!existsSync(gitDir)) {
  process.exit(0);
}

try {
  execSync("git config core.hooksPath .githooks", { stdio: "ignore" });
} catch {
  // Ignore hook setup failures in environments without git.
}
