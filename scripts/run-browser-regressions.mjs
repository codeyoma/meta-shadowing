import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (!process.env.SUPABASE_TEST_WORKDIR && process.env.CI !== "true") {
  throw new Error("Set SUPABASE_TEST_WORKDIR to a disposable local Supabase stack. Browser regressions now use real account persistence.");
}
// Provider redirects/admin parsing use their existing non-persistence fixtures.
// Learner UI regressions use real Auth + SQL, including their setup records.
for (const command of [
  ["npx", ["playwright", "test", "--pass-with-no-tests", ...args]],
  ["node", ["scripts/run-admin-persistence-integration.mjs", "--learner-ui", "--project=mobile", "--pass-with-no-tests", ...args]],
]) {
  const result = spawnSync(command[0], command[1], { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
