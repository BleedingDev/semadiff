import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

function findTgz(dir: string, slug: string): string {
  const entries = readdirSync(dir);
  const tgz = entries
    .filter((entry) => entry.startsWith(slug) && entry.endsWith(".tgz"))
    .sort()
    .at(-1);
  if (!tgz) {
    throw new Error(`No .tgz found in ${dir} for ${slug}`);
  }
  return join(dir, tgz);
}

function packPackage(packDir: string, name: string): string {
  execSync(`pnpm --filter ${name} pack --pack-destination ${packDir}`, {
    stdio: "inherit",
  });
  const slug = name.startsWith("@semadiff/")
    ? name.replace("@semadiff/", "semadiff-")
    : name.replace("@", "").replace("/", "-");
  return findTgz(packDir, slug);
}

test("packed CLI artifact can run a real diff", () => {
  execSync("pnpm build", { stdio: "inherit" });

  const tempDir = mkdtempSync(join(tmpdir(), "semadiff-pack-"));
  const packDir = join(tempDir, "packs");
  execSync(`mkdir -p ${packDir}`);

  const packages = [
    "@semadiff/cli",
    "@semadiff/core",
    "@semadiff/parsers",
    "@semadiff/parser-lightningcss",
    "@semadiff/parser-swc",
    "@semadiff/parser-tree-sitter-node",
    "@semadiff/render-terminal",
  ];
  const tarballMap = Object.fromEntries(
    packages.map((pkg) => [pkg, packPackage(packDir, pkg)])
  );

  const consumerDir = join(tempDir, "consumer");
  execSync(`mkdir -p ${consumerDir}`);
  const overrides = Object.fromEntries(
    Object.entries(tarballMap)
      .filter(([name]) => name !== "@semadiff/cli")
      .map(([name, tarball]) => [name, `file:${tarball}`])
  );
  const rootPackageJson = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8")
  ) as { pnpm?: { onlyBuiltDependencies?: string[] } };
  const onlyBuiltDependencies =
    rootPackageJson.pnpm?.onlyBuiltDependencies ?? [];
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: "semadiff-consumer",
        private: true,
        dependencies: {
          "@semadiff/cli": `file:${tarballMap["@semadiff/cli"]}`,
        },
        pnpm: {
          overrides,
          onlyBuiltDependencies,
        },
      },
      null,
      2
    )
  );
  execSync("pnpm install", { cwd: consumerDir, stdio: "inherit" });

  const cliEntry = join(
    consumerDir,
    "node_modules",
    "@semadiff",
    "cli",
    "dist",
    "index.js"
  );

  const helpOutput = execSync(`node ${cliEntry} --help`, {
    cwd: consumerDir,
  }).toString();
  expect(helpOutput).toContain("diff");
  expect(helpOutput).toContain("git-external");

  const oldFile = join(tempDir, "old.ts");
  const newFile = join(tempDir, "new.ts");
  writeFileSync(oldFile, "const value = 1;\n");
  writeFileSync(newFile, "const value = 2;\n");

  const diffOutput = execSync(
    `node ${cliEntry} diff --format plain ${oldFile} ${newFile}`,
    { cwd: consumerDir }
  ).toString();
  expect(diffOutput.length).toBeGreaterThan(0);
});
