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
const REDACTED_JSON_FIELD_REGEX = /"redacted"\s*:\s*true/;

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

test("bug report copies diagnostics by default", async ({ page }) => {
  await ensureExtensionBuilt();

  await page.setContent(prHtml);
  await page.evaluate(() => {
    window.confirm = () => false;
    window.alert = () => undefined;
    window.open = () => null;
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: (text: string) => {
          (window as any).__clipboard = text;
          return Promise.resolve();
        },
      },
    });
  });
  await page.addScriptTag({ path: contentScriptPath, type: "module" });
  await page.getByRole("button", { name: "Report bug" }).click();
  const clipboard = await page.evaluate(() => (window as any).__clipboard);
  expect(clipboard).toContain("Diagnostics");
  expect(clipboard).toMatch(REDACTED_JSON_FIELD_REGEX);
});
