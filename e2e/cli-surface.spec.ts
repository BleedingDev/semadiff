import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { bunBinary, distPath } from "./helpers.js";

const cliPath = distPath("packages", "cli", "dist", "index.js");

test("semadiff --help lists commands", () => {
  execSync("pnpm --filter @semadiff/cli build", { stdio: "inherit" });

  const output = execSync(`${bunBinary} ${cliPath} --help`).toString();
  expect(output).toContain("diff");
  expect(output).toContain("git-external");
  expect(output).toContain("difftool");
  expect(output).toContain("install-git");
  expect(output).toContain("config");
  expect(output).toContain("doctor");
  expect(output).toContain("bench");
  expect(output).toContain("explain");
});
