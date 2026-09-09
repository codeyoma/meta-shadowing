// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test("CI collector exports only failure metadata, never arbitrary report content", () => {
  const directory = mkdtempSync(join(tmpdir(), "safe-ci-test-"));
  const secret = "fixture-credential-do-not-export";
  const input = join(directory, "raw.json"), output = join(directory, "safe.json");
  try {
    writeFileSync(input, JSON.stringify({
      config: { metadata: secret }, errors: [{ message: `socket hang up Cookie: ${secret}` }],
      suites: [{ title: secret, suites: [], specs: [{ title: secret, file: "practice-recovery.spec.ts", line: 6, column: 5,
        tests: [{ projectName: "desktop", expectedStatus: "passed", results: [{ status: "failed", duration: 42, retry: 0,
          error: { message: `socket hang up Authorization: ${secret}`, stack: secret },
          stdout: [{ text: secret }], stderr: [{ text: secret }], attachments: [{ path: secret, body: secret }],
        }] }],
      }] }],
    }));
    const result = spawnSync(process.execPath, ["scripts/collect-ci-artifacts.mjs", input, output], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const artifact = readFileSync(output, "utf8");
    expect(artifact).not.toContain(secret);
    expect(result.stdout + result.stderr).not.toContain(secret);
    expect(JSON.parse(artifact)).toEqual({ version: 1, runnerErrors: ["network-reset"], tests: [{
      file: "practice-recovery.spec.ts", line: 6, column: 5, project: "desktop", expectedStatus: "passed",
      attempts: [{ status: "failed", durationMs: 42, retry: 0, failure: "network-reset" }],
    }] });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("CI runner preserves a real Playwright failure while withholding its credentials", () => {
  const directory = mkdtempSync(join(tmpdir(), "safe-ci-runner-"));
  const secret = "fixture-unknown-session-token";
  try {
    const playwright = pathToFileURL(resolve("node_modules/@playwright/test/index.mjs")).href;
    writeFileSync(join(directory, "credential.spec.mjs"), `import { test } from ${JSON.stringify(playwright)};
      test(${JSON.stringify(secret)}, async ({}, testInfo) => {
        await testInfo.attach('storage-state', { body: ${JSON.stringify(secret)}, contentType: 'text/plain' });
        throw new Error(${JSON.stringify(secret)});
      });`);
    const config = join(directory, "playwright.config.mjs");
    writeFileSync(config, `export default { testDir: ${JSON.stringify(directory)}, retries: 0, workers: 1, projects: [{ name: 'desktop' }] };`);
    const artifacts = join(directory, "safe");
    const result = spawnSync(process.execPath, ["--input-type=module", "-e",
      `import { runPlaywright } from './scripts/run-playwright.mjs'; process.exit(runPlaywright(${JSON.stringify(["--config", config, "--output", join(directory, "private-output"), "--reporter=line"])}));`,
    ], { encoding: "utf8", env: { ...process.env, SAFE_CI_ARTIFACT_DIR: artifacts } });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(secret);
    const files = readdirSync(artifacts);
    expect(files).toHaveLength(1);
    const output = readFileSync(join(artifacts, files[0]), "utf8");
    expect(output).not.toContain(secret);
    expect(JSON.parse(output).tests[0].attempts[0].status).toBe("failed");
    expect(JSON.parse(output).tests[0]).toMatchObject({ file: "unknown", project: "desktop", line: 2 });
    // Failed uploads must not erase the only credential-safe test identifier.
    expect(result.stdout).toMatch(/CI failure: unknown:2:\d+ \[desktop\] retry=0 status=failed category=other/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 20000);

test("CI collector fails closed on malformed input without echoing it", () => {
  const directory = mkdtempSync(join(tmpdir(), "safe-ci-test-"));
  try {
    const input = join(directory, "raw.json");
    writeFileSync(input, "credential-sensitive-malformed-input");
    const result = spawnSync(process.execPath, ["scripts/collect-ci-artifacts.mjs", input, join(directory, "safe.json")], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).not.toContain("credential-sensitive-malformed-input");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
