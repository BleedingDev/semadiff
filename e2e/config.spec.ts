import { strict as assert } from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@playwright/test";
import { distPath } from "./helpers.js";

const cliPath = distPath("packages", "cli", "dist", "index.js");

test("config resolution order is env, user, project", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "semadiff-config-"));
  const projectConfigPath = join(tempRoot, "semadiff.config.json");
  const homeDir = join(tempRoot, "home");
  const userConfigDir = join(homeDir, ".config", "semadiff");
  const userConfigPath = join(userConfigDir, "config.json");

  mkdirSync(userConfigDir, { recursive: true });

  writeFileSync(
    projectConfigPath,
    JSON.stringify(
      {
        renderer: { format: "plain" },
        normalizers: { global: { tailwind: false } },
      },
      null,
      2
    )
  );

  writeFileSync(
    userConfigPath,
    JSON.stringify(
      {
        renderer: { format: "ansi" },
        telemetry: { enabled: true, exporter: "otlp-http" },
      },
      null,
      2
    )
  );

  execSync("pnpm --filter @semadiff/cli build", { stdio: "inherit" });

  const output = execSync(`node ${cliPath} config`, {
    cwd: tempRoot,
    env: {
      ...process.env,
      HOME: homeDir,
      SEMADIFF_RENDERER_FORMAT: "json",
      SEMADIFF_TELEMETRY_EXPORTER: "otlp-grpc",
      SEMADIFF_TELEMETRY_ENDPOINT: "http://127.0.0.1:4318/v1/traces",
    },
  }).toString();

  const parsed = JSON.parse(output);
  assert.equal(parsed.config.renderer.format, "json");
  assert.equal(parsed.config.normalizers.global.tailwind, false);
  assert.equal(parsed.config.telemetry.enabled, true);
  assert.equal(parsed.config.telemetry.exporter, "otlp-grpc");
  assert.equal(
    parsed.config.telemetry.endpoint,
    "http://127.0.0.1:4318/v1/traces"
  );

  assert.equal(parsed.sources.renderer.format, "env");
  assert.equal(parsed.sources.normalizers.global.tailwind, "project");
  assert.equal(parsed.sources.telemetry.enabled, "user");
  assert.equal(parsed.sources.telemetry.exporter, "env");
  assert.equal(parsed.sources.telemetry.endpoint, "env");
  assert.equal(Array.isArray(parsed.normalizerRules), true);
  assert.ok(parsed.normalizerRules.length > 0);
});
