import { execSync } from "node:child_process";
import { test } from "@playwright/test";

test("pnpm quality exits zero", () => {
  execSync("pnpm quality", { stdio: "inherit" });
});
