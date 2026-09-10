import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, relative, join } from "node:path";

// Reconstruct an allowlist, rather than redacting free-form errors/attachments.
// Playwright reports can contain cookies, signed URLs and storage state anywhere.
function sourceFiles(directory, specsOnly = true) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path, specsOnly) : (specsOnly ? /\.spec\.ts$/ : /\.tsx?$/).test(path) ? [relative("e2e", path)] : [];
  });
}
const statuses = new Set(["passed", "failed", "timedOut", "skipped", "interrupted"]);
const numeric = value => Number.isFinite(value) && value >= 0 ? value : 0;
const status = value => statuses.has(value) ? value : "unknown";
function resumeTimings(result) {
  // Only explicit top-level diagnostic steps, never arbitrary nested API calls.
  if (!Array.isArray(result.steps)) return [];
  return result.steps.slice(0, 128).flatMap(step => {
    const match = typeof step?.title === "string"
      ? /^resume:(open-stages|server-journal|device-journal|seed|viewport|navigate|ready|fonts|measure|assert|screenshot):(0|320|360|375|390|430)$/.exec(step.title) : null;
    if (!match) return [];
    // Playwright reports the active step as -1 with no error on test timeout.
    // Preserve that boundary without inventing a duration or an assertion failure.
    if (step.duration === -1 && ["timedOut", "interrupted"].includes(result.status))
      return [{ phase: match[1], width: Number(match[2]), durationMs: null, unfinished: true }];
    if (!Number.isSafeInteger(step.duration) || step.duration < 0 || step.duration > 120000) return [];
    return [{ phase: match[1], width: Number(match[2]), durationMs: step.duration, failed: Boolean(step.error) }];
  }).slice(0, 64);
}
function mp3Expiry(result) {
  const attachment = result.attachments?.find(item => item.name === "mp3-expiry-diagnostic-v1"
    && item.contentType === "application/json" && typeof item.body === "string" && item.body.length <= 32768);
  if (!attachment) return;
  try {
    const value = JSON.parse(Buffer.from(attachment.body, "base64").toString("utf8"));
    if (!Number.isSafeInteger(value?.downloads) || value.downloads < 0 || value.downloads > 10000 || !Array.isArray(value.events)) return;
    const events = value.events.slice(0, 64).filter(item => item
      && ["download", "access-held", "expiry-released", "assertion"].includes(item.event)
      && [0, 1, 2].includes(item.phrase)
      && Number.isSafeInteger(item.elapsedMs) && item.elapsedMs >= 0 && item.elapsedMs <= 120000)
      .map(item => ({ event: item.event, phrase: item.phrase, elapsedMs: item.elapsedMs }));
    return { downloads: value.downloads, events };
  } catch { /* Invalid diagnostic bodies are withheld, not echoed. */ }
}
function category(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  if (/socket hang up|ECONNRESET/.test(message)) return "network-reset";
  if (/timeout|timed out/i.test(message)) return "timeout";
  if (/expect\(|AssertionError/.test(message)) return "assertion";
  return "other";
}

// Values are reconstructed from local source inventory and fixed enums. Never
// serialize error messages, stack frames, selectors, URLs or step titles.
const operations = ["locator.click", "locator.tap", "locator.selectOption", "locator.fill", "locator.press", "locator.evaluate",
  "locator.waitFor", "page.goto", "page.reload", "page.waitForResponse", "page.waitForLoadState", "page.setViewportSize",
  "apiRequestContext.get", "apiRequestContext.post", "apiRequestContext.patch", "apiRequestContext.delete", "route.fetch", "route.fulfill"];
function operation(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  return operations.find(name => message.includes(`${name}:`))
    ?? (/expect\(|AssertionError/.test(message) ? "assertion" : undefined);
}

function failureLocation(result, files) {
  function validate(location) {
    if (typeof location?.file !== "string" || /[?\r\n]|:\/\//.test(location.file)) return;
    const normalized = location.file.replaceAll("\\", "/");
    const file = normalized.startsWith("e2e/") ? normalized.slice(4) : normalized.split("/e2e/").at(-1);
    const lines = files.get(file);
    if (!lines || !Number.isInteger(location.line) || location.line < 1 || location.line > lines.length
      || !Number.isInteger(location.column) || location.column < 1 || location.column > lines[location.line - 1].length + 1) return;
    return { file: `e2e/${file}`, line: location.line, column: location.column };
  }
  const direct = validate(result.errorLocation);
  if (direct) return direct;
  const stack = typeof result.error?.stack === "string" ? result.error.stack : "";
  for (const frame of stack.split("\n")) {
    const match = frame.match(/^\s+at (?:.*\()?([^()]+):(\d+):(\d+)\)?$/);
    if (!match) continue;
    const location = validate({ file: match[1], line: Number(match[2]), column: Number(match[3]) });
    if (location) return location;
  }
}

try {
  const [input, output] = process.argv.slice(2);
  const report = JSON.parse(readFileSync(input, "utf8"));
  if (!Array.isArray(report.suites)) throw new Error("Invalid report");
  const sources = new Set(sourceFiles("e2e"));
  const locations = new Map(sourceFiles("e2e", false).map(file => [file, readFileSync(join("e2e", file), "utf8").split("\n")]));
  const tests = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      const file = typeof spec.file === "string" && sources.has(spec.file) ? spec.file : "unknown";
      for (const test of spec.tests ?? []) {
        tests.push({ file, line: numeric(spec.line), column: numeric(spec.column),
          project: ["desktop", "mobile"].includes(test.projectName) ? test.projectName : "unknown",
          expectedStatus: status(test.expectedStatus),
          attempts: (test.results ?? []).map(result => {
            const expiry = mp3Expiry(result);
            const timings = resumeTimings(result);
            return { status: status(result.status), durationMs: numeric(result.duration),
            retry: numeric(result.retry), ...(timings.length ? { resumeTimings: timings } : {}), ...(expiry ? { mp3Expiry: expiry } : {}), ...(result.error ? { failure: category(result.error),
              ...(operation(result.error) ? { operation: operation(result.error) } : {}),
              ...(failureLocation(result, locations) ? { failureLocation: failureLocation(result, locations) } : {}),
            } : {}) };
          }),
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
