// @vitest-environment node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../scripts/check-branch-policy.mjs", import.meta.url));
const repository = "codeyoma/meta-shadowing";

function check(base: string, head: string, headRepository = repository) {
  return spawnSync(process.execPath, [script], {
    input: JSON.stringify({ pull_request: {
      base: { ref: base, repo: { full_name: repository } },
      head: { ref: head, repo: { full_name: headRepository } }
    } }),
    encoding: "utf8",
    env: { ...process.env, GITHUB_EVENT_NAME: "pull_request", GITHUB_REPOSITORY: repository }
  });
}

describe("pull request branch policy", () => {
  it("allows an internal feature branch to integrate into dev", () => {
    expect(check("dev", "codex/audio-fix").status).toBe(0);
  });

  it("allows the integration branch to request a main release", () => {
    expect(check("main", "dev").status).toBe(0);
  });

  it("allows a released main branch to be synchronized back into dev", () => {
    expect(check("dev", "main").status).toBe(0);
  });

  it.each([
    ["main", "codex/skip-integration"],
    ["main", "main"],
    ["dev", "dev"],
    ["dev", "untracked-feature"],
    ["release", "dev"]
  ])("rejects an unsupported PR from %s <- %s", (base, head) => {
    expect(check(base, head).status).toBe(1);
  });

  it("rejects a fork named dev impersonating the release source", () => {
    expect(check("main", "dev", "someone/meta-shadowing").status).toBe(1);
  });

  it("rejects missing pull request metadata instead of silently passing", () => {
    const result = spawnSync(process.execPath, [script], {
      input: "{}", encoding: "utf8",
      env: { ...process.env, GITHUB_EVENT_NAME: "pull_request", GITHUB_REPOSITORY: repository }
    });
    expect(result.status).toBe(1);
  });

  it("allows the post-merge push check without pretending it is a release approval", () => {
    const result = spawnSync(process.execPath, [script], {
      input: "{}", encoding: "utf8",
      env: { ...process.env, GITHUB_EVENT_NAME: "push", GITHUB_REPOSITORY: repository }
    });
    expect(result.status).toBe(0);
  });
});
