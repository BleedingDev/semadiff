import { execSync } from "node:child_process";
import { test } from "@playwright/test";

test("workspace package builds succeed", () => {
  execSync("pnpm -r build", { stdio: "inherit" });
});
