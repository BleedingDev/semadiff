import { spawnSync } from "node:child_process";

const EXCLUDES = [
	"!tree-sitter/**",
	"!dist/**",
	"!coverage/**",
	"!packages/test-corpus/fixtures/**",
	"!packages/**/test/fixtures/**",
	"!bench/cases/**",
	"!**/__fixtures__/**",
	"!**/*.snap",
	"!**/*.snap.*",
	"!apps/pr-viewer/src/routeTree.gen.ts",
];

const args = ["exec", "oxfmt", "--config", ".oxfmtrc.jsonc"];
if (process.argv.includes("--check")) {
	args.push("--check");
}

args.push(".", ...EXCLUDES);

const result = spawnSync("pnpm", args, {
	stdio: "inherit",
});

if (result.error) {
	throw result.error;
}

process.exit(result.status ?? 0);
