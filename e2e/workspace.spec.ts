import { execSync } from "node:child_process";
import { test } from "@playwright/test";

test("workspace package builds succeed (excluding app build)", () => {
  execSync("pnpm -r --filter '!pr-viewer' build", { stdio: "inherit" });
});
