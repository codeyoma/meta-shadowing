import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export function runPlaywright(args, env = process.env) {
  const destination = env.SAFE_CI_ARTIFACT_DIR;
  if (!destination) return spawnSync("npx", ["playwright", "test", ...args], { stdio: "inherit", env }).status ?? 1;
  const temporary = mkdtempSync(join(tmpdir(), "private-playwright-report-"));
  try {
    const raw = join(temporary, "report.json");
    mkdirSync(destination, { recursive: true });
    const safe = join(destination, `${randomUUID()}.json`);
    const safeArgs = args.filter((argument, index) => argument !== "--reporter" && !argument.startsWith("--reporter=") && args[index - 1] !== "--reporter");
    // JSON-to-file may implicitly add a console reporter. Withhold ALL raw child
    // output, including browser console and API errors containing auth headers.
    const result = spawnSync("npx", ["playwright", "test", ...safeArgs, "--reporter=json"], {
      stdio: "ignore", env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: raw },
    });
    if (!existsSync(raw)) {
      writeFileSync(safe, JSON.stringify({ version: 1, runnerErrors: ["report-unavailable"], tests: [] }));
      return result.status || 1;
    }
    const collected = spawnSync(process.execPath, ["scripts/collect-ci-artifacts.mjs", raw, safe], { stdio: "inherit", env });
    if (collected.status !== 0) return 1;
    const report = JSON.parse(readFileSync(safe, "utf8"));
    console.log(`Playwright exit=${result.status ?? 1}; ${report.tests.length} test results retained in credential-safe artifacts.`);
    return result.status ?? 1;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
