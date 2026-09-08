import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const learnerPreferences = process.argv.includes("--learner-preferences");

const status = execFileSync(
  "npx",
  ["--yes", "supabase@2.116.0", "status", "-o", "env",
    ...(process.env.SUPABASE_TEST_WORKDIR ? ["--workdir", process.env.SUPABASE_TEST_WORKDIR] : [])],
  { encoding: "utf8" }
);

const localEnvironment = Object.fromEntries(
  status
    .split("\n")
    .map((line) => line.match(/^([A-Z_]+)="(.*)"$/))
    .filter((match) => match !== null)
    .map((match) => [match[1], match[2]])
);

const required = ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"];
const missing = required.filter((name) => !localEnvironment[name]);
if (missing.length > 0) {
  throw new Error(
    `Start the local Supabase stack before running integration tests. Missing: ${missing.join(", ")}`
  );
}

if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(localEnvironment.API_URL).hostname)) {
  throw new Error("Integration fixtures may only use the local Supabase stack.");
}

const integrationEnvironment = {
  ...process.env,
  ADMIN_TEST_MODE: "0",
  CLOUD_LEARNING_ENABLED: learnerPreferences ? "1" : "0",
  ADMIN_SUPABASE_INTEGRATION: "1",
  SUPABASE_INTEGRATION_URL: localEnvironment.API_URL,
  SUPABASE_INTEGRATION_PUBLISHABLE_KEY: localEnvironment.PUBLISHABLE_KEY,
  SUPABASE_INTEGRATION_SECRET_KEY: localEnvironment.SECRET_KEY,
  NEXT_PUBLIC_SUPABASE_URL: localEnvironment.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localEnvironment.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: localEnvironment.SECRET_KEY,
  BETA_PASSWORD: "integration-beta-password",
  LEARNER_COOKIE_SECRET: "integration-learner-cookie-secret"
};

if (process.env.PLAYWRIGHT_PRODUCTION === "1") {
  // Next.js embeds public settings in the browser bundle at build time.
  const build = spawnSync("npm", ["run", "build"], { stdio: "inherit", env: integrationEnvironment });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const result = spawnSync(
  "npx",
  [
    "playwright",
    "test",
    ...(learnerPreferences ? ["e2e/learner-preferences.integration.spec.ts"] : ["e2e/admin-persistence.integration.spec.ts",
    "e2e/lesson-publication.integration.spec.ts",
    "e2e/session-defaults.integration.spec.ts",
    "e2e/lesson-lifecycle.integration.spec.ts"]),
    "--project=desktop",
    "--workers=1",
    `--output=${join(tmpdir(), `meta-shadowing-integration-${process.pid}`)}`,
    ...process.argv.slice(2).filter(argument => argument !== "--learner-preferences")
  ],
  {
    stdio: "inherit",
    env: integrationEnvironment
  }
);

process.exit(result.status ?? 1);
