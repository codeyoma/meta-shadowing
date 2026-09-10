// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test("resume timing diagnostics retain only fixed phases and bounded numeric fields", () => {
  const directory = mkdtempSync(join(tmpdir(), "safe-resume-timing-"));
  const secret = "fixture-private-token-never-export";
  try {
    const input = join(directory, "raw.json"), output = join(directory, "safe.json");
    writeFileSync(input, JSON.stringify({ suites: [{ specs: [{ file: "mobile-first-browse.spec.ts", tests: [{
      projectName: "desktop", results: [{ status: "timedOut", steps: [
        { title: "resume:open-stages:0", duration: 12, steps: [{ title: secret, duration: 1 }] },
        { title: "resume:fonts:320", duration: 28000, error: { message: secret }, url: secret },
        { title: `resume:${secret}:320`, duration: 2 },
        { title: "resume:fonts:321", duration: 2 },
        { title: "resume:fonts:320", duration: -2 },
        { title: "resume:fonts:320", duration: 120001 },
      ] }]
    }] }] }] }));
    const result = spawnSync(process.execPath, ["scripts/collect-ci-artifacts.mjs", input, output], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const artifact = readFileSync(output, "utf8");
    expect(artifact + result.stdout + result.stderr).not.toContain(secret);
    expect(JSON.parse(artifact).tests[0].attempts[0].resumeTimings).toEqual([
      { phase: "open-stages", width: 0, durationMs: 12, failed: false },
      { phase: "fonts", width: 320, durationMs: 28000, failed: true },
    ]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a real timed-out Playwright step retains safe resume diagnostics in artifacts and job output", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "safe-resume-timeout-")));
  const secret = "fixture-timeout-cookie-never-export";
  try {
    const playwright = pathToFileURL(resolve("node_modules/@playwright/test/index.mjs")).href;
    writeFileSync(join(directory, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(directory, "resume-timeout-fixture.spec.ts"), `import { test } from ${JSON.stringify(playwright)};
      test(${JSON.stringify(secret)}, async () => {
        console.log(${JSON.stringify(secret)});
        await test.step('resume:fonts:320', () => new Promise(() => {}));
      });`);
    const config = join(directory, "playwright.config.mjs");
    writeFileSync(config, `export default { testDir: ${JSON.stringify(directory)}, timeout: 1000, retries: 0, workers: 1, projects: [{ name: 'desktop' }] };`);
    const artifacts = join(directory, "safe");
    const result = spawnSync(process.execPath, ["--input-type=module", "-e",
      `import { runPlaywright } from './scripts/run-playwright.mjs'; process.exit(runPlaywright(${JSON.stringify(["--config", config, "--output", join(directory, "private-output")])}));`,
    ], { encoding: "utf8", env: { ...process.env, SAFE_CI_ARTIFACT_DIR: artifacts } });
    expect(result.status).toBe(1);
    const output = readFileSync(join(artifacts, readdirSync(artifacts)[0]), "utf8");
    expect(output + result.stdout + result.stderr).not.toContain(secret);
    const attempt = JSON.parse(output).tests[0].attempts[0];
    expect(attempt.status).toBe("timedOut");
    expect(attempt.resumeTimings).toHaveLength(1);
    expect(attempt.resumeTimings[0]).toEqual({ phase: "fonts", width: 320, durationMs: null, unfinished: true });
    expect(result.stdout).toContain("CI resume timings:");
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 20000);

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
  // Match CI's canonical temp path even where tmpdir() is a symlink (macOS).
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "safe-ci-runner-")));
  const secret = "fixture-unknown-session-token";
  try {
    const playwright = pathToFileURL(resolve("node_modules/@playwright/test/index.mjs")).href;
    writeFileSync(join(directory, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(directory, "credential-safety-fixture.spec.ts"), `import { test, expect } from ${JSON.stringify(playwright)};
      test(${JSON.stringify(secret)}, async ({}, testInfo) => {
        await testInfo.attach('storage-state', { body: ${JSON.stringify(secret)}, contentType: 'text/plain' });
        await testInfo.attach('mp3-expiry-diagnostic-v1', { body: JSON.stringify({ downloads: 2, events: [
          { event: 'download', phrase: 1, elapsedMs: 12, url: ${JSON.stringify(secret)} },
          { event: 'download', phrase: 2, elapsedMs: 15 },
          { event: ${JSON.stringify(secret)}, phrase: 1, elapsedMs: 20 },
          { event: 'download', phrase: ${JSON.stringify(secret)}, elapsedMs: 22 },
          { event: 'download', phrase: 1, elapsedMs: -1 }
        ], token: ${JSON.stringify(secret)} }), contentType: 'application/json' });
        expect(${JSON.stringify(secret)}).toBe('different');
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
    expect(JSON.parse(output).tests[0].attempts[0].mp3Expiry).toEqual({ downloads: 2, events: [
      { event: "download", phrase: 1, elapsedMs: 12 }, { event: "download", phrase: 2, elapsedMs: 15 }
    ] });
    // Failed uploads must not erase the only credential-safe test identifier.
    expect(result.stdout).toMatch(/CI failure: unknown:2:\d+ \[desktop\] retry=0 status=failed category=assertion/);
    expect(result.stdout).toContain('CI MP3 expiry: {"downloads":2,"events":');
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

test("MP3 diagnostics reject malformed or oversized bodies and never read attachment paths", () => {
  const directory = mkdtempSync(join(tmpdir(), "safe-mp3-bounds-"));
  const input = join(directory, "raw.json"), output = join(directory, "safe.json");
  const secret = "fixture-private-audio-token";
  const attachment = (value: unknown) => ({ name: "mp3-expiry-diagnostic-v1", contentType: "application/json",
    body: Buffer.from(JSON.stringify(value)).toString("base64") });
  const valid = { downloads: 0, events: [{ event: "assertion", phrase: 1, elapsedMs: 0 }] };
  try {
    const privateFile = join(directory, "private.json");
    writeFileSync(privateFile, JSON.stringify(valid));
    const attachments = [
      attachment({ ...valid, downloads: secret }), attachment({ ...valid, downloads: -1 }),
      attachment({ ...valid, downloads: 10001 }), attachment({ ...valid, events: null }),
      { ...attachment(valid), body: "not-json" }, { ...attachment(valid), body: "x".repeat(32769) },
      { name: "mp3-expiry-diagnostic-v1", contentType: "application/json", path: privateFile },
      attachment({ downloads: 2, events: Array.from({ length: 70 }, () => ({ event: "download", phrase: 2, elapsedMs: 10, cookie: secret })) }),
      attachment(valid),
    ];
    writeFileSync(input, JSON.stringify({ suites: [{ specs: [{ file: "mp3-cache.integration.spec.ts", tests: [{
      projectName: "desktop", results: attachments.map(item => ({ status: "failed", attachments: [item] }))
    }] }] }] }));
    const result = spawnSync(process.execPath, ["scripts/collect-ci-artifacts.mjs", input, output], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const text = readFileSync(output, "utf8");
    expect(text + result.stdout + result.stderr).not.toContain(secret);
    expect(text).not.toContain(privateFile);
    const attempts = JSON.parse(text).tests[0].attempts;
    for (const attempt of attempts.slice(0, 7)) expect(attempt).not.toHaveProperty("mp3Expiry");
    expect(attempts[7].mp3Expiry.events).toHaveLength(64);
    expect(attempts[8].mp3Expiry).toEqual(valid);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("CI collector retains validated failure locations and fixed operation names only", () => {
  const directory = mkdtempSync(join(tmpdir(), "safe-ci-location-"));
  const secret = "fixture-token-never-publish";
  const input = join(directory, "raw.json"), output = join(directory, "safe.json");
  const location = { file: `/private/${secret}/repo/e2e/stage-popover.spec.ts`, line: 54, column: 3 };
  const attempts = [
    { errorLocation: location, error: { message: `locator.selectOption: Timeout exceeded URL=https://example.com/?token=${secret}` } },
    { error: { message: `apiRequestContext.get: socket hang up Cookie: ${secret}`, stack: `Error: ${secret}\n    at openLearnerPage (/private/${secret}/repo/e2e/fixtures/cloud-navigation.ts:1:1)` } },
    { errorLocation: { ...location, file: `/private/${secret}/outside.ts` }, error: { message: secret } },
    { errorLocation: { ...location, line: 999999 }, error: { message: `expect(locator).toBeVisible() failed ${secret}` } },
    { errorLocation: { ...location, file: `https://example.com/e2e/stage-popover.spec.ts?token=${secret}` }, error: { message: secret } },
  ];
  try {
    writeFileSync(input, JSON.stringify({ suites: [{ specs: [{ file: "stage-popover.spec.ts", line: 28, column: 5,
      tests: [{ projectName: "mobile", expectedStatus: "passed", results: attempts.map(attempt => ({ ...attempt, status: "failed", duration: 1, retry: 0 })) }],
    }] }] }));
    const result = spawnSync(process.execPath, ["scripts/collect-ci-artifacts.mjs", input, output], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const contents = readFileSync(output, "utf8");
    expect(contents + result.stdout + result.stderr).not.toContain(secret);
    expect(contents).not.toContain("/private/");
    const results = JSON.parse(contents).tests[0].attempts;
    expect(results[0]).toMatchObject({ failureLocation: { file: "e2e/stage-popover.spec.ts", line: 54, column: 3 }, operation: "locator.selectOption" });
    expect(results[1]).toMatchObject({ failureLocation: { file: "e2e/fixtures/cloud-navigation.ts", line: 1, column: 1 }, operation: "apiRequestContext.get" });
    for (const index of [2, 3, 4]) expect(results[index]).not.toHaveProperty("failureLocation");
    expect(results[2]).not.toHaveProperty("operation");
    expect(results[3].operation).toBe("assertion");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
