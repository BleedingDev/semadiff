import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const packagesDir = path.join(workspaceRoot, "packages");

const run = (args, label) => {
  process.stdout.write(`\n[publint] ${label}\n`);
  const result = spawnSync("pnpm", args, {
    cwd: workspaceRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const discoverPublishablePackages = () => {
  const entries = readdirSync(packagesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name, "package.json"))
    .map((manifestPath) => {
      const raw = readFileSync(manifestPath, "utf8");
      const pkg = JSON.parse(raw);
      return {
        name: pkg.name,
        private: pkg.private === true,
      };
    })
    .filter(
      (pkg) =>
        typeof pkg.name === "string" &&
        pkg.name.startsWith("@semadiff/") &&
        !pkg.private
    )
    .sort((a, b) => a.name.localeCompare(b.name));
};

const publishablePackages = discoverPublishablePackages();

if (publishablePackages.length === 0) {
  process.stdout.write("[publint] No publishable packages found.\n");
  process.exit(0);
}

const buildArgs = [
  "-r",
  ...publishablePackages.flatMap((pkg) => ["--filter", pkg.name]),
  "build",
];
run(buildArgs, "Building publishable packages");

for (const pkg of publishablePackages) {
  run(
    ["--filter", pkg.name, "exec", "publint", "run", "--strict", "."],
    `Linting ${pkg.name}`
  );
}

process.stdout.write(
  `\n[publint] Completed checks for ${publishablePackages.length} packages.\n`
);
