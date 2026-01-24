import { execSync } from "node:child_process";
import { test } from "@playwright/test";

test("pnpm -r build succeeds", () => {
  execSync("pnpm -r build", { stdio: "inherit" });
});
