import { readFileSync } from "node:fs";

try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  if (process.env.GITHUB_EVENT_NAME !== "pull_request") {
    console.log("No pull request route to validate; this is not release approval.");
  } else {
    const repository = process.env.GITHUB_REPOSITORY;
    const pull = event.pull_request;
    if (!repository || pull?.base?.repo?.full_name !== repository || pull?.head?.repo?.full_name !== repository) {
      throw new Error("Pull requests must use branches in this repository.");
    }
    const base = pull.base.ref;
    const head = pull.head.ref;
    const feature = typeof head === "string" && head.startsWith("codex/") && head.length > "codex/".length;
    const allowed = (base === "main" && head === "dev") || (base === "dev" && (feature || head === "main"));
    if (!allowed) {
      throw new Error("Use codex/* -> dev for features, dev -> main for releases, or main -> dev for release synchronization.");
    }
    console.log("Pull request branch policy passed. Release approval is a separate gate.");
  }
} catch (error) {
  console.error(error instanceof SyntaxError ? "Invalid GitHub event JSON." : error.message);
  process.exitCode = 1;
}
