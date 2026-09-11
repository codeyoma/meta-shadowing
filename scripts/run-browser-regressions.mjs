import { spawnSync } from "node:child_process";
import { runPlaywright } from "./run-playwright.mjs";

const args = process.argv.slice(2);
if (!process.env.SUPABASE_TEST_WORKDIR && process.env.CI !== "true") {
  throw new Error("Set SUPABASE_TEST_WORKDIR to a disposable local Supabase stack. Browser regressions now use real account persistence.");
}
// Provider redirects/admin parsing use their existing non-persistence fixtures.
// Learner UI regressions use real Auth + SQL, including their setup records.
for (const command of [
  ["npx", ["playwright", "test", "--pass-with-no-tests", ...args]],
  // Keep both existing viewports explicit; the integration runner now honors
  // project overrides rather than silently adding its desktop default.
  ["node", ["scripts/run-admin-persistence-integration.mjs", "--learner-ui", "--project=mobile", "--project=desktop", "--pass-with-no-tests", ...args]],
]) {
  const status = command[0] === "npx" ? runPlaywright(command[1].slice(2))
    // Offline recovery needs the production shell's complete static dependency
    // graph; development/HMR chunks are not an installable offline application.
    : spawnSync(command[0], command[1], { stdio: "inherit", env: { ...process.env, PLAYWRIGHT_PRODUCTION: "1" } }).status ?? 1;
  if (status !== 0) process.exit(status);
}
