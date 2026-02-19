#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ARGS = new Set(process.argv.slice(2));
const JSON_OUTPUT = ARGS.has("--json");
const STRICT = ARGS.has("--strict");

const SCAN_ROOTS = ["packages", "apps", "e2e"];
const CODE_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
]);
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".output",
  "dist",
  "coverage",
  ".next",
]);

const NEWLINE_SPLIT_RE = /\r?\n/;
const EFFECT_RANGE_EXACT_4_RE = /^\s*4(\.|$)/;
const EFFECT_RANGE_CARET_4_RE = /\^4(\.|$)/;
const EFFECT_RANGE_TILDE_4_RE = /~\s*4(\.|$)/;
const EFFECT_RANGE_GTE_4_RE = />=\s*4(\.|$)/;
const EFFECT_RANGE_LT_5_RE = /<\s*5/;
const EFFECT_RANGE_OR_RE = /\|\|/;
const EFFECT_RANGE_HAS_4_RE = /4(\.|$)/;

const REMOVED_API_PATTERNS = [
  {
    name: "Context.Tag",
    regex: /\bContext\.Tag\(/g,
    note: "Effect v4 removes Context.Tag in favor of ServiceMap.Service.",
  },
  {
    name: "Effect.Service",
    regex: /\bEffect\.Service</g,
    note: "Effect v4 removes Effect.Service in favor of ServiceMap.Service.",
  },
  {
    name: "Effect.catchAll",
    regex: /\bEffect\.catchAll\(/g,
    note: "Effect v4 renames catchAll to catch.",
  },
  {
    name: "Effect.Service.Default usage",
    regex: /\.Default\b/g,
    note: "Effect.Service.Default is removed in Effect v4.",
  },
  {
    name: "Effect.Service dependencies option",
    regex: /\bdependencies:\s*\[/g,
    note: "Effect.Service dependencies option is removed in Effect v4.",
  },
];

const DEPENDENCY_NAMES = [
  "effect",
  "@effect/cli",
  "@effect/platform",
  "@effect/platform-bun",
  "@effect/platform-node",
  "@effect/vitest",
  "@effect/language-service",
];

function writeLine(text = "") {
  process.stdout.write(`${text}\n`);
}

function statExists(filePath) {
  try {
    statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function collectCodeFiles(dir, files) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      collectCodeFiles(fullPath, files);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name);
    if (CODE_FILE_EXTENSIONS.has(ext)) {
      files.push(fullPath);
    }
  }
}

function getLineInfo(content, index) {
  const linesBeforeMatch = content.slice(0, index).split(NEWLINE_SPLIT_RE);
  const line = linesBeforeMatch.length;
  const currentLine = content.split(NEWLINE_SPLIT_RE)[line - 1] ?? "";
  return { line, snippet: currentLine.trim() };
}

function scanRemovedApis(files) {
  const results = REMOVED_API_PATTERNS.map((pattern) => ({
    name: pattern.name,
    note: pattern.note,
    count: 0,
    matches: [],
  }));

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const [idx, pattern] of REMOVED_API_PATTERNS.entries()) {
      pattern.regex.lastIndex = 0;
      let match = pattern.regex.exec(content);
      while (match) {
        const info = getLineInfo(content, match.index);
        results[idx].count += 1;
        if (results[idx].matches.length < 20) {
          results[idx].matches.push({
            file: path.relative(ROOT, file),
            line: info.line,
            snippet: info.snippet,
          });
        }
        match = pattern.regex.exec(content);
      }
    }
  }

  return results;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function listPackageJsonFiles() {
  const packageJsonFiles = [path.join(ROOT, "package.json")];
  for (const topLevel of ["packages", "apps"]) {
    const rootDir = path.join(ROOT, topLevel);
    if (!statExists(rootDir)) {
      continue;
    }
    const children = readdirSync(rootDir, { withFileTypes: true });
    for (const child of children) {
      if (!child.isDirectory()) {
        continue;
      }
      const manifest = path.join(rootDir, child.name, "package.json");
      if (statExists(manifest)) {
        packageJsonFiles.push(manifest);
      }
    }
  }
  return packageJsonFiles;
}

function collectDependencyUsage() {
  const manifests = listPackageJsonFiles();
  const usage = new Map();
  for (const dep of DEPENDENCY_NAMES) {
    usage.set(dep, []);
  }
  for (const manifestPath of manifests) {
    const manifest = readJson(manifestPath);
    const sections = [
      manifest.dependencies ?? {},
      manifest.devDependencies ?? {},
      manifest.peerDependencies ?? {},
      manifest.optionalDependencies ?? {},
    ];
    for (const dep of DEPENDENCY_NAMES) {
      const match = sections
        .map((section) => section[dep])
        .find((value) => value !== undefined);
      if (match) {
        usage.get(dep)?.push({
          manifest: path.relative(ROOT, manifestPath),
          range: match,
        });
      }
    }
  }
  return usage;
}

function npmView(name, field = "version") {
  return npmViewSpec(`${name}@latest`, field);
}

function npmViewSpec(spec, field = "version") {
  const stdout = execFileSync("npm", ["view", spec, field, "--json"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  }).trim();
  if (!stdout) {
    return null;
  }
  return JSON.parse(stdout);
}

function npmVersionExists(spec) {
  try {
    const stdout = execFileSync("npm", ["view", spec, "version", "--json"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    }).trim();
    return Boolean(stdout && JSON.parse(stdout));
  } catch {
    return false;
  }
}

function normalizeVersion(value) {
  if (Array.isArray(value)) {
    const last = value.at(-1);
    return typeof last === "string" ? last : null;
  }
  return typeof value === "string" ? value : null;
}

function pickRegistrySpec(dep, usedBy) {
  const declaredRanges = [...new Set(usedBy.map((entry) => entry.range))];
  const firstRange = declaredRanges.find(
    (range) =>
      typeof range === "string" &&
      range.length > 0 &&
      !range.startsWith("workspace:")
  );
  return firstRange ? `${dep}@${firstRange}` : `${dep}@latest`;
}

function effectRangeSupportsV4(range) {
  if (!range) {
    return null;
  }
  return (
    EFFECT_RANGE_EXACT_4_RE.test(range) ||
    EFFECT_RANGE_CARET_4_RE.test(range) ||
    EFFECT_RANGE_TILDE_4_RE.test(range) ||
    EFFECT_RANGE_GTE_4_RE.test(range) ||
    EFFECT_RANGE_LT_5_RE.test(range) ||
    (EFFECT_RANGE_OR_RE.test(range) && EFFECT_RANGE_HAS_4_RE.test(range))
  );
}

function emptyDependencyStatus(dep, usedBy) {
  return {
    dependency: dep,
    usedBy,
    checkedSpec: null,
    latestVersion: null,
    resolvedVersion: null,
    peerEffectRange: null,
    supportsEffectV4: null,
    error: null,
  };
}

function collectDependencyStatus(dep, usedBy) {
  try {
    const latestVersion = npmView(dep, "version");
    const checkedSpec = pickRegistrySpec(dep, usedBy);
    const resolvedVersion = normalizeVersion(
      npmViewSpec(checkedSpec, "version")
    );
    const peerDependencies = resolvedVersion
      ? npmViewSpec(`${dep}@${resolvedVersion}`, "peerDependencies")
      : npmViewSpec(checkedSpec, "peerDependencies");
    const peerEffectRange =
      peerDependencies && typeof peerDependencies === "object"
        ? (peerDependencies.effect ?? null)
        : null;
    let supportsEffectV4 = null;
    if (dep === "effect") {
      const ranges = usedBy.map((entry) => entry.range);
      supportsEffectV4 =
        ranges.length === 0
          ? npmVersionExists("effect@4.0.0-beta.0")
          : ranges.every((range) => effectRangeSupportsV4(range) === true);
    } else if (peerEffectRange) {
      supportsEffectV4 = effectRangeSupportsV4(peerEffectRange);
    }
    return {
      dependency: dep,
      usedBy,
      checkedSpec,
      latestVersion,
      resolvedVersion,
      peerEffectRange,
      supportsEffectV4,
      error: null,
    };
  } catch (cause) {
    return {
      dependency: dep,
      usedBy,
      checkedSpec: null,
      latestVersion: null,
      resolvedVersion: null,
      peerEffectRange: null,
      supportsEffectV4: null,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

function collectRegistryStatus(usage) {
  return DEPENDENCY_NAMES.map((dep) => {
    const usedBy = usage.get(dep) ?? [];
    if (usedBy.length === 0) {
      return emptyDependencyStatus(dep, usedBy);
    }
    return collectDependencyStatus(dep, usedBy);
  });
}

function buildBlockers(apiUsage, registryStatus) {
  const blockers = [];
  for (const usage of apiUsage) {
    if (usage.count === 0) {
      continue;
    }
    blockers.push({
      kind: "removed-api",
      title: `${usage.name} appears ${usage.count} time(s)`,
      detail: usage.note,
    });
  }
  for (const dep of registryStatus) {
    if (dep.usedBy.length === 0) {
      continue;
    }
    if (dep.error) {
      blockers.push({
        kind: "registry-error",
        title: `Failed checking ${dep.dependency}`,
        detail: dep.error,
      });
      continue;
    }
    if (dep.dependency !== "effect" && dep.supportsEffectV4 === false) {
      blockers.push({
        kind: "peer-constraint",
        title: `${dep.dependency}@${dep.resolvedVersion ?? dep.latestVersion ?? "latest"} does not declare effect v4 support`,
        detail: `checked=${dep.checkedSpec ?? "latest"}, peerDependencies.effect=${
          dep.peerEffectRange ?? "not declared"
        }`,
      });
    }
  }
  return blockers;
}

function printSummary(report) {
  writeLine("Effect v4 readiness report");
  writeLine(`Generated: ${report.generatedAt}`);
  writeLine(`Ready now: ${report.ready ? "yes" : "no"}`);
  writeLine("");
  writeLine("Removed API usage:");
  for (const usage of report.removedApiUsage) {
    writeLine(`- ${usage.name}: ${usage.count}`);
  }
  writeLine("");
  writeLine("Dependency compatibility:");
  for (const dep of report.registryStatus) {
    if (dep.usedBy.length === 0) {
      continue;
    }
    writeLine(
      `- ${dep.dependency}: latest=${dep.latestVersion ?? "unknown"}, checked=${
        dep.checkedSpec ?? "latest"
      }, resolved=${dep.resolvedVersion ?? "unknown"}, peer.effect=${
        dep.peerEffectRange ?? "n/a"
      }, supportsV4=${
        dep.supportsEffectV4 === null ? "unknown" : String(dep.supportsEffectV4)
      }`
    );
  }
  if (report.blockers.length === 0) {
    return;
  }
  writeLine("");
  writeLine("Blockers:");
  for (const blocker of report.blockers) {
    writeLine(`- [${blocker.kind}] ${blocker.title} (${blocker.detail})`);
  }
}

const files = [];
for (const scanRoot of SCAN_ROOTS) {
  const fullPath = path.join(ROOT, scanRoot);
  if (statExists(fullPath)) {
    collectCodeFiles(fullPath, files);
  }
}

const removedApiUsage = scanRemovedApis(files);
const dependencyUsage = collectDependencyUsage();
const registryStatus = collectRegistryStatus(dependencyUsage);
const blockers = buildBlockers(removedApiUsage, registryStatus);

const report = {
  generatedAt: new Date().toISOString(),
  ready: blockers.length === 0,
  removedApiUsage,
  registryStatus,
  blockers,
};

if (JSON_OUTPUT) {
  writeLine(JSON.stringify(report, null, 2));
} else {
  printSummary(report);
}

if (STRICT && blockers.length > 0) {
  process.exitCode = 1;
}
