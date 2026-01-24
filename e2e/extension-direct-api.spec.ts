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

const directApiHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="csrf-token" content="csrf123" />
    <title>GitHub PR Direct API</title>
  </head>
  <body>
    <div class="file" data-path="src/app.tsx">
      <div class="js-file-line" data-line-number="10" data-position="5" data-side="RIGHT">
        <form class="js-inline-comment-form" action="/comment" method="post">
          <input type="hidden" name="authenticity_token" value="csrf123" />
          <input type="hidden" name="position" value="5" />
          <textarea name="comment[body]"></textarea>
        </form>
        <form class="js-resolve-thread-form" action="/resolve" method="post">
          <input type="hidden" name="authenticity_token" value="csrf123" />
          <button class="js-resolve-thread">Resolve</button>
        </form>
      </div>
    </div>
  </body>
</html>`;

test("direct API comment + resolve uses CSRF and form endpoints", async ({
  page,
}) => {
  await ensureExtensionBuilt();

  page.on("dialog", async (dialog) => {
    await dialog.accept("Hello from API");
  });

  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("semadiff-direct-api", "true");
    } catch {
      (
        window as { __semadiffSessionStorage?: Record<string, string> }
      ).__semadiffSessionStorage = { "semadiff-direct-api": "true" };
    }
    document.documentElement.dataset.semadiffDirectApi = "true";
    document.documentElement.dataset.semadiffCommentBody = "Hello from API";
    document.documentElement.dataset.semadiffDebug = "true";
  });

  await page.setContent(directApiHtml, { url: "https://example.com/pr" });
  await page.addScriptTag({ path: contentScriptPath, type: "module" });
  await page.evaluate(() => {
    (window as { __debugRequests?: unknown[] }).__debugRequests = [];
    window.addEventListener("semadiff-debug-request", (event) => {
      const detail = (event as CustomEvent).detail;
      (window as { __debugRequests?: unknown[] }).__debugRequests?.push(detail);
    });
  });
  await page.waitForSelector("#semadiff-toggle");
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
  await page.evaluate(() => {
    (
      window as { __semadiffSessionStorage?: Record<string, string> }
    ).__semadiffSessionStorage = { "semadiff-direct-api": "true" };
    document.documentElement.dataset.semadiffDirectApi = "true";
    document.documentElement.dataset.semadiffCommentBody = "Hello from API";
    document.documentElement.dataset.semadiffDebug = "true";
  });

  const directApiEnabled = await page.evaluate(() => {
    let sessionValue: string | null = null;
    try {
      sessionValue = sessionStorage.getItem("semadiff-direct-api");
    } catch {
      sessionValue = null;
    }
    return (
      sessionValue === "true" ||
      document.documentElement.dataset.semadiffDirectApi === "true"
    );
  });
  expect(directApiEnabled).toBe(true);
  const domState = await page.evaluate(() => ({
    commentBody: document.documentElement.dataset.semadiffCommentBody ?? null,
    commentAction:
      document
        .querySelector<HTMLFormElement>(".js-inline-comment-form")
        ?.getAttribute("action") ?? null,
    resolveAction:
      document
        .querySelector<HTMLFormElement>(".js-resolve-thread-form")
        ?.getAttribute("action") ?? null,
  }));
  expect(domState.commentBody).toBe("Hello from API");
  expect(domState.commentAction).toBe("/comment");
  expect(domState.resolveAction).toBe("/resolve");

  await page.locator("#semadiff-toggle").click();
  await page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("#semadiff-overlay button")
    );
    buttons.find((button) => button.textContent === "Comment")?.click();
    buttons.find((button) => button.textContent === "Resolve")?.click();
  });

  await page.waitForFunction(
    () =>
      (window as { __debugRequests?: unknown[] }).__debugRequests?.length === 2
  );

  const calls = await page.evaluate(() => {
    return (window as { __debugRequests?: unknown[] }).__debugRequests ?? [];
  });

  const [commentCall, resolveCall] = calls as Array<{
    url: string;
    headers: Record<string, string>;
    bodyEntries: [string, string][];
  }>;

  expect(commentCall).toBeDefined();
  expect(resolveCall).toBeDefined();
  if (!(commentCall && resolveCall)) {
    return;
  }

  expect(commentCall.url).toContain("/comment");
  expect(commentCall.headers["x-csrf-token"]).toBe("csrf123");
  expect(commentCall.bodyEntries).toEqual(
    expect.arrayContaining([
      ["comment[body]", "Hello from API"],
      ["path", "src/app.tsx"],
      ["line", "10"],
      ["side", "RIGHT"],
      ["position", "5"],
    ])
  );

  expect(resolveCall.url).toContain("/resolve");
  expect(resolveCall.headers["x-csrf-token"]).toBe("csrf123");
  expect(resolveCall.bodyEntries).toEqual(
    expect.arrayContaining([
      ["path", "src/app.tsx"],
      ["line", "10"],
      ["side", "RIGHT"],
      ["position", "5"],
    ])
  );
});
