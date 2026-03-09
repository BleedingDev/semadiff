import { describe, expect, test } from "vitest";

import {
	buildPullDiffFromFiles,
	buildPullFilesFromGitDiff,
	isLargePullRequestDiffError,
	isPullRequestFilesTruncated,
	paginateJsonArray,
	shouldBypassGitHubPullFilesApi,
} from "../../../scripts/refresh-real-pr-corpus.mjs";

describe("refresh real PR corpus helpers", () => {
	test("paginateJsonArray combines GitHub-style pages until the trailing partial page", () => {
		const visitedPages: number[] = [];
		const items = paginateJsonArray((page) => {
			visitedPages.push(page);
			if (page === 1) {
				return [{ id: 1 }, { id: 2 }, { id: 3 }];
			}
			if (page === 2) {
				return [{ id: 4 }];
			}
			return [];
		}, 3);

		expect(visitedPages).toEqual([1, 2]);
		expect(items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
	});

	test("buildPullDiffFromFiles reconstructs unified diff headers for archived PRs", () => {
		const diff = buildPullDiffFromFiles([
			{
				filename: "src/updated.ts",
				status: "modified",
				patch:
					"@@ -1 +1 @@\n-export const before = 1;\n+export const after = 2;",
			},
			{
				filename: "src/new.ts",
				status: "added",
				patch: "@@ -0,0 +1 @@\n+export const added = true;",
			},
			{
				filename: "src/old.ts",
				status: "removed",
				patch: "@@ -1 +0,0 @@\n-export const removed = true;",
			},
			{
				filename: "src/renamed.ts",
				previous_filename: "src/original.ts",
				status: "renamed",
				patch: "",
			},
		]);

		expect(diff).toContain("diff --git a/src/updated.ts b/src/updated.ts");
		expect(diff).toContain("--- /dev/null");
		expect(diff).toContain("+++ /dev/null");
		expect(diff).toContain("rename from src/original.ts");
		expect(diff).toContain("rename to src/renamed.ts");
		expect(diff).toContain("Binary files differ");
	});

	test("detects GitHub 406 large-diff failures", () => {
		expect(
			isLargePullRequestDiffError(
				new Error(
					"gh: Sorry, the diff exceeded the maximum number of files (300). (HTTP 406)",
				),
			),
		).toBe(true);
		expect(
			isLargePullRequestDiffError(
				new Error("gh: validation failed (HTTP 422)"),
			),
		).toBe(false);
	});

	test("buildPullFilesFromGitDiff parses full git fallback diffs", () => {
		const files =
			buildPullFilesFromGitDiff(`diff --git a/src/updated.ts b/src/updated.ts
index 1111111..2222222 100644
--- a/src/updated.ts
+++ b/src/updated.ts
@@ -1 +1 @@
-export const before = 1;
+export const after = 2;
diff --git a/src/old.ts b/src/new.ts
similarity index 98%
rename from src/old.ts
rename to src/new.ts
index 3333333..4444444 100644
--- a/src/old.ts
+++ b/src/new.ts
@@ -1 +1 @@
-export const renamed = "old";
+export const renamed = "new";
diff --git a/src/created.ts b/src/created.ts
new file mode 100644
index 0000000..5555555
--- /dev/null
+++ b/src/created.ts
@@ -0,0 +1 @@
+export const created = true;
diff --git a/src/deleted.ts b/src/deleted.ts
deleted file mode 100644
index 6666666..0000000
--- a/src/deleted.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const removed = true;
`);

		expect(files).toEqual([
			{
				additions: 1,
				changes: 2,
				deletions: 1,
				filename: "src/updated.ts",
				patch:
					"@@ -1 +1 @@\n-export const before = 1;\n+export const after = 2;",
				status: "modified",
			},
			{
				additions: 1,
				changes: 2,
				deletions: 1,
				filename: "src/new.ts",
				patch:
					'@@ -1 +1 @@\n-export const renamed = "old";\n+export const renamed = "new";',
				previous_filename: "src/old.ts",
				status: "renamed",
			},
			{
				additions: 1,
				changes: 1,
				deletions: 0,
				filename: "src/created.ts",
				patch: "@@ -0,0 +1 @@\n+export const created = true;",
				status: "added",
			},
			{
				additions: 0,
				changes: 1,
				deletions: 1,
				filename: "src/deleted.ts",
				patch: "@@ -1 +0,0 @@\n-export const removed = true;",
				status: "removed",
			},
		]);
	});

	test("buildPullFilesFromGitDiff decodes quoted git paths", () => {
		const files =
			buildPullFilesFromGitDiff(`diff --git "a/docs/armin-mehinovi\\304\\207.png" "b/docs/armin-mehinovi\\304\\207.png"
index 1111111..2222222 100644
--- "a/docs/armin-mehinovi\\304\\207.png"
+++ "b/docs/armin-mehinovi\\304\\207.png"
`);

		expect(files).toEqual([
			{
				additions: 0,
				changes: 0,
				deletions: 0,
				filename: "docs/armin-mehinović.png",
				patch: "",
				status: "modified",
			},
		]);
	});

	test("detects when GitHub pull file pagination is still truncated", () => {
		expect(isPullRequestFilesTruncated(200, new Array(150).fill(null))).toBe(
			true,
		);
		expect(isPullRequestFilesTruncated(150, new Array(150).fill(null))).toBe(
			false,
		);
		expect(
			isPullRequestFilesTruncated(undefined, new Array(150).fill(null)),
		).toBe(false);
	});

	test("bypasses the GitHub file list API once a PR exceeds the known 3000-file cap", () => {
		expect(shouldBypassGitHubPullFilesApi(3001)).toBe(true);
		expect(shouldBypassGitHubPullFilesApi(3000)).toBe(false);
		expect(shouldBypassGitHubPullFilesApi(undefined)).toBe(false);
	});
});
