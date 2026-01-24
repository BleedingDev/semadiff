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
  </body>
</html>`;

const prWithBlobsHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>GitHub PR Blobs</title>
  </head>
  <body>
    <div
      class="file"
      data-path="src/app.tsx"
      data-base-blob-url="data:text/plain,const%20value%20=%201;%0A"
      data-head-blob-url="data:text/plain,const%20value%20=%202;%0A"
    ></div>
  </body>
</html>`;

test("blob fetch failure yields error state", async ({ page }) => {
  await ensureExtensionBuilt();

  await page.setContent(prHtml);
  await page.addScriptTag({ path: contentScriptPath, type: "module" });

  const button = page.getByRole("button", { name: "Load diff" }).first();
  await button.click();
  await expect(page.locator("text=Error:")).toBeVisible();
});

test("blob fetch success renders iframe", async ({ page }) => {
  await ensureExtensionBuilt();

  await page.setContent(prWithBlobsHtml);
  await page.addScriptTag({ path: contentScriptPath, type: "module" });

  const button = page.getByRole("button", { name: "Load diff" }).first();
  await button.click();
  await expect(page.locator("iframe")).toBeVisible();
});
