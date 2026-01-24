import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { distPath } from "./helpers.js";

const cliPath = distPath("packages", "cli", "dist", "index.js");

test("install-git prints verification checklist", () => {
  execSync("pnpm --filter @semadiff/cli build", { stdio: "inherit" });

  const output = execSync(`node ${cliPath} install-git`).toString();

  expect(output).toContain("external = semadiff git-external");
  expect(output).toContain("cmd = semadiff difftool $LOCAL $REMOTE");
  expect(output).toContain("git diff --ext-diff");
  expect(output).toContain("git show --ext-diff");
  expect(output).toContain("git log -p --ext-diff");
  expect(output).toContain("git difftool --tool=semadiff");
});
