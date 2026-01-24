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

const actionsHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>GitHub PR Actions</title>
  </head>
  <body>
    <div class="file" data-path="src/app.tsx">
      <div class="js-file-line" data-line-number="10">
        <button class="js-add-line-comment" data-hit="0">+</button>
        <button class="js-resolve-thread" data-hit="0">Resolve</button>
      </div>
    </div>
  </body>
</html>`;

test("bridge jump highlights file", async ({ page }) => {
  await ensureExtensionBuilt();

  await page.addInitScript(() => {
    window.alert = () => undefined;
  });

  await page.setContent(prHtml);
  await page.addScriptTag({ path: contentScriptPath, type: "module" });

  const jump = page
    .locator("#semadiff-overlay")
    .getByRole("button", { name: "Jump" })
    .first();
  await jump.click();

  const highlighted = page.locator("div.file.semadiff-highlight");
  await expect(highlighted).toHaveCount(1);
});

test("bridge comment and resolve clicks native buttons", async ({ page }) => {
  await ensureExtensionBuilt();

  await page.setContent(actionsHtml);
  await page.evaluate(() => {
    const comment = document.querySelector<HTMLButtonElement>(
      ".js-add-line-comment"
    );
    const resolve =
      document.querySelector<HTMLButtonElement>(".js-resolve-thread");
    if (comment) {
      comment.dataset.hit = "0";
      comment.addEventListener("click", () => {
        const current = Number.parseInt(comment.dataset.hit ?? "0", 10);
        comment.dataset.hit = String(current + 1);
      });
    }
    if (resolve) {
      resolve.dataset.hit = "0";
      resolve.addEventListener("click", () => {
        const current = Number.parseInt(resolve.dataset.hit ?? "0", 10);
        resolve.dataset.hit = String(current + 1);
      });
    }
  });
  await page.addScriptTag({ path: contentScriptPath, type: "module" });
  await page.waitForSelector("#semadiff-overlay");
  await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>(
      "#semadiff-overlay .sd-file"
    );
    if (container) {
      container.dataset.lineStatus = "mapped";
      container.dataset.line = "10";
    }
  });

  await page
    .locator("#semadiff-overlay")
    .getByRole("button", { name: "Comment" })
    .click();
  const commentHit = await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>(
      ".js-add-line-comment"
    );
    return button?.dataset.hit ?? "0";
  });
  expect(commentHit).toBe("1");

  await page
    .locator("#semadiff-overlay")
    .getByRole("button", { name: "Resolve" })
    .click();
  const resolveHit = await page.evaluate(() => {
    const button =
      document.querySelector<HTMLButtonElement>(".js-resolve-thread");
    return button?.dataset.hit ?? "0";
  });
  expect(resolveHit).toBe("1");
});
