import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { ensureExtensionBuilt } from "./helpers/extension-build";

const SOURCE_FILE_RE = /source file/i;

const contentScriptPath = join(
	process.cwd(),
	"packages",
	"github-extension",
	"dist",
	"content.js",
);

const prHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>GitHub PR</title>
  </head>
  <body>
    <div class="file" data-path="src/app.tsx"></div>
    <div class="file" data-path="pnpm-lock.yaml"></div>
  </body>
</html>`;

test("overlay renders review queue guidance before diffs are loaded", async ({
	page,
}) => {
	await ensureExtensionBuilt();

	await test.step("mount the content script on a PR-like page", async () => {
		await page.setContent(prHtml);
		await page.addScriptTag({ path: contentScriptPath, type: "module" });
	});

	await test.step("open the overlay and verify review guidance renders", async () => {
		await page.getByRole("button", { name: "SemaDiff" }).click();
		await expect(page.getByText("Review queue")).toBeVisible();
		await expect(page.getByText(SOURCE_FILE_RE)).toBeVisible();
		await expect(page.getByText("Review Next")).toBeVisible();
	});
});
