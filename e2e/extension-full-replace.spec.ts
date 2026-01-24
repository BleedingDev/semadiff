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

const prWithBlobsHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>GitHub PR Fixture (Blobs)</title>
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

test("full replace mode hides native diff blocks", async ({ page }) => {
  await ensureExtensionBuilt();

  await page.setContent(prWithBlobsHtml);
  await page.evaluate(() => {
    (window as any).__semadiffSessionStorage = {
      "semadiff-full-replace": "true",
    };
  });
  await page.addScriptTag({ path: contentScriptPath, type: "module" });

  const button = page.getByRole("button", { name: "Load diff" }).first();
  await button.click();

  const replacement = page.locator(".semadiff-replace");
  await expect(replacement).toBeVisible();

  const hidden = await page
    .locator("div.file[data-path='src/app.tsx']")
    .evaluate((node) => (node as HTMLElement).style.display);
  expect(hidden).toBe("none");
});
