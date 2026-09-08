import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, relative, join } from "node:path";

// Reconstruct an allowlist, rather than redacting free-form errors/attachments.
// Playwright reports can contain cookies, signed URLs and storage state anywhere.
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.spec\.ts$/.test(path) ? [relative("e2e", path)] : [];
  });
}
const statuses = new Set(["passed", "failed", "timedOut", "skipped", "interrupted"]);
const numeric = value => Number.isFinite(value) && value >= 0 ? value : 0;
const status = value => statuses.has(value) ? value : "unknown";
function category(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  if (/socket hang up|ECONNRESET/.test(message)) return "network-reset";
  if (/timeout|timed out/i.test(message)) return "timeout";
  if (/expect\(|AssertionError/.test(message)) return "assertion";
  return "other";
}

try {
  const [input, output] = process.argv.slice(2);
  const report = JSON.parse(readFileSync(input, "utf8"));
  if (!Array.isArray(report.suites)) throw new Error("Invalid report");
  const sources = new Set(sourceFiles("e2e"));
  const tests = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      const file = typeof spec.file === "string" && sources.has(spec.file) ? spec.file : "unknown";
      for (const test of spec.tests ?? []) {
        tests.push({ file, line: numeric(spec.line), column: numeric(spec.column),
          project: ["desktop", "mobile"].includes(test.projectName) ? test.projectName : "unknown",
          expectedStatus: status(test.expectedStatus),
          attempts: (test.results ?? []).map(result => ({ status: status(result.status), durationMs: numeric(result.duration),
            retry: numeric(result.retry), ...(result.error ? { failure: category(result.error) } : {}) })),
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  writeFileSync(resolve(output), JSON.stringify({ version: 1, runnerErrors: (report.errors ?? []).map(category), tests }, null, 2));
} catch {
  // Never echo parser errors, input paths, or raw input into public CI logs.
  console.error("Safe CI artifact collection failed; raw report withheld.");
  process.exitCode = 1;
}
