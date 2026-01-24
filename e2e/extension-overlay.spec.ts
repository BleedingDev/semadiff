import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { ensureExtensionBuilt } from "./helpers/extension-build";

const contentScriptPath = join(
  process.cwd(),
  "packages",
  "github-extension",
  "dist",
  "content.js"
);

const prHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>GitHub PR</title>
  </head>
  <body>
    <div class="file" data-path="src/app.tsx"></div>
    <div class="file" data-path="src/utils.ts"></div>
  </body>
</html>`;

test("overlay injects on PR page", async ({ page }) => {
  await ensureExtensionBuilt();

  await page.setContent(prHtml);
  await page.addScriptTag({ path: contentScriptPath, type: "module" });
  await expect(page.locator("#semadiff-toggle")).toBeVisible();
});
