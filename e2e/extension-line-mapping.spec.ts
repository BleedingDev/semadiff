import { Buffer } from "node:buffer";
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

function dataUrl(text: string) {
  return `data:text/plain;base64,${Buffer.from(text).toString("base64")}`;
}

test("comment targets mapped line (off-by-one guard)", async ({ page }) => {
  await ensureExtensionBuilt();

  const base = "const a = 1;\nconst b = 1;\n";
  const head = "const a = 1;\nconst b = 2;\n";
  const prHtml = `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>GitHub PR</title>
    </head>
    <body>
      <div class="file" data-path="src/app.tsx" data-base-blob-url="${dataUrl(
        base
      )}" data-head-blob-url="${dataUrl(head)}">
        <div class="js-file-line" data-line-number="1">
          <button class="js-add-line-comment" data-line="1" data-hit="0">+</button>
        </div>
        <div class="js-file-line" data-line-number="2">
          <button class="js-add-line-comment" data-line="2" data-hit="0">+</button>
        </div>
      </div>
    </body>
  </html>`;

  await page.setContent(prHtml, { url: "https://example.com/pr" });
  await page.evaluate(() => {
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      ".js-add-line-comment"
    )) {
      button.addEventListener("click", () => {
        const current = Number.parseInt(button.dataset.hit ?? "0", 10);
        button.dataset.hit = String(current + 1);
      });
    }
  });
  await page.addScriptTag({ path: contentScriptPath, type: "module" });

  const overlay = page.locator("#semadiff-overlay");
  await expect(overlay).toBeVisible();
  await overlay.getByRole("button", { name: "Load diff" }).click();
  await page.waitForFunction(() => {
    const container = document.querySelector<HTMLElement>(
      "#semadiff-overlay .sd-file"
    );
    return container?.dataset.lineStatus === "mapped";
  });

  await overlay.getByRole("button", { name: "Comment" }).click();

  const hits = await page.evaluate(() => {
    const line1 = document.querySelector<HTMLButtonElement>(
      ".js-add-line-comment[data-line='1']"
    )?.dataset.hit;
    const line2 = document.querySelector<HTMLButtonElement>(
      ".js-add-line-comment[data-line='2']"
    )?.dataset.hit;
    return { line1: line1 ?? "0", line2: line2 ?? "0" };
  });

  expect(hits.line1).toBe("0");
  expect(hits.line2).toBe("1");
});

test("unmappable diff blocks comment actions", async ({ page }) => {
  await ensureExtensionBuilt();

  const base = "const a = 1;\nconst b = 1;\n";
  const head = "const a = 1;\nconst b = 1;\n";
  const prHtml = `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>GitHub PR</title>
    </head>
    <body>
      <div class="file" data-path="src/app.tsx" data-base-blob-url="${dataUrl(
        base
      )}" data-head-blob-url="${dataUrl(head)}">
        <div class="js-file-line" data-line-number="1">
          <button class="js-add-line-comment" data-line="1" data-hit="0">+</button>
        </div>
      </div>
    </body>
  </html>`;

  await page.addInitScript(() => {
    window.alert = (message?: string) => {
      (window as { __lastAlert?: string }).__lastAlert = String(message ?? "");
    };
  });
  await page.setContent(prHtml, { url: "https://example.com/pr" });
  await page.evaluate(() => {
    window.alert = (message?: string) => {
      (window as { __lastAlert?: string }).__lastAlert = String(message ?? "");
    };
  });
  await page.addScriptTag({ path: contentScriptPath, type: "module" });

  const overlay = page.locator("#semadiff-overlay");
  await expect(overlay).toBeVisible();
  await overlay.getByRole("button", { name: "Load diff" }).click();
  await page.waitForFunction(() => {
    const container = document.querySelector<HTMLElement>(
      "#semadiff-overlay .sd-file"
    );
    return container?.dataset.lineStatus === "unmappable";
  });
  const mappingState = await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>(
      "#semadiff-overlay .sd-file"
    );
    return {
      status: container?.dataset.lineStatus ?? "",
      line: container?.dataset.line ?? "",
    };
  });
  expect(mappingState.status).toBe("unmappable");
  expect(mappingState.line).toBe("");

  await overlay.getByRole("button", { name: "Comment" }).click();
  await page.waitForFunction(
    () => (window as { __lastAlert?: string }).__lastAlert?.length
  );

  const state = await page.evaluate(() => ({
    hit:
      document.querySelector<HTMLButtonElement>(".js-add-line-comment")?.dataset
        .hit ?? "0",
    alert: (window as { __lastAlert?: string }).__lastAlert ?? "",
  }));

  expect(state.hit).toBe("0");
  expect(state.alert).toContain("No mapped line available for comments.");
});
