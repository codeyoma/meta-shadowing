// @vitest-environment node
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

const configured = {
  BETA_PASSWORD: "release-check-not-a-real-password",
  LEARNER_COOKIE_SECRET: "release-check-not-a-real-cookie-secret",
  NEXT_PUBLIC_SUPABASE_URL: "https://release-check.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_release_check_only",
  SUPABASE_SECRET_KEY: "sb_secret_release_check_only"
};
function check(env: Record<string, string>) {
  const result = spawnSync(process.execPath, ["scripts/check-release-env.mjs"], { env: { NODE_ENV: "test", ...env }, encoding: "utf8" });
  return { code: result.status, output: result.stdout + result.stderr };
}

test("release preflight fails closed when the hosted environment is missing", () => {
  const result = check({});
  expect(result.code).toBe(1);
  expect(result.output).toContain("LEARNER_COOKIE_SECRET");
  expect(result.output).toContain("SUPABASE_SECRET_KEY");
});
test("a configured release passes without exposing any value", () => {
  const result = check(configured);
  expect(result.code).toBe(0);
  expect(result.output).toContain("passed");
  for (const value of Object.values(configured)) expect(result.output).not.toContain(value);
});
test("a secret in a browser variable and test-mode configuration block release without echoing secrets", () => {
  const result = check({ ...configured, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: configured.SUPABASE_SECRET_KEY, ADMIN_TEST_MODE: "1" });
  expect(result.code).toBe(1);
  expect(result.output).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  expect(result.output).toContain("ADMIN_TEST_MODE");
  expect(result.output).not.toContain(configured.SUPABASE_SECRET_KEY);
});
test("weak cookie signing and non-HTTPS hosted URLs block release", () => {
  const result = check({ ...configured, LEARNER_COOKIE_SECRET: "short", NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" });
  expect(result.code).toBe(1);
  expect(result.output).toContain("LEARNER_COOKIE_SECRET");
  expect(result.output).toContain("NEXT_PUBLIC_SUPABASE_URL");
});
