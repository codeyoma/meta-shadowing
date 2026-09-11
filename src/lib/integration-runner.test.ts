// @vitest-environment node
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

for (const { args, expected } of [
  { args: [], expected: ["--project=desktop"] },
  { args: ["--project=mobile"], expected: ["--project=mobile"] },
  { args: ["--project", "mobile"], expected: ["--project", "mobile"] },
  { args: ["--project=mobile", "--project=desktop"], expected: ["--project=mobile", "--project=desktop"] },
]) test(`integration CLI honors project selection: ${args.join(" ") || "desktop default"}`, () => {
  const directory = mkdtempSync(join(tmpdir(), "integration-runner-"));
  try {
    // Stub only the external CLI boundary: the real runner still constructs and
    // launches its Playwright command, without needing a database or browsers.
    const npx = join(directory, "npx");
    writeFileSync(npx, `#!${process.execPath}
      const args = process.argv.slice(2);
      if (args.includes("status")) console.log('API_URL="http://127.0.0.1:62321"\\nPUBLISHABLE_KEY="fixture-public"\\nSECRET_KEY="fixture-secret"');
      else if (args[0] === "playwright" && args[1] === "test") console.log(JSON.stringify(args.slice(2)));
      else process.exit(2);
    `);
    chmodSync(npx, 0o700);
    const result = spawnSync(process.execPath, ["scripts/run-admin-persistence-integration.mjs", "--learner-ui", "--list", ...args], {
      encoding: "utf8", env: { ...process.env, PATH: `${directory}:${process.env.PATH}`,
        PLAYWRIGHT_PRODUCTION: "0", SAFE_CI_ARTIFACT_DIR: "", SUPABASE_TEST_WORKDIR: directory },
    });
    expect(result.status).toBe(0);
    const forwarded: string[] = JSON.parse(result.stdout.trim());
    expect(forwarded.filter((arg, index) => arg.startsWith("--project") || forwarded[index - 1] === "--project")).toEqual(expected);
    expect(forwarded).toContain("--workers=1");
    expect(forwarded).toContain("--list");
    expect(result.stdout + result.stderr).not.toContain("fixture-secret");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
