import { execFileSync, spawnSync } from "node:child_process";

const status = execFileSync(
  "npx",
  ["--yes", "supabase@2.116.0", "status", "-o", "env"],
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

const result = spawnSync(
  "npx",
  [
    "playwright",
    "test",
    "e2e/admin-persistence.integration.spec.ts",
    "e2e/lesson-publication.integration.spec.ts",
    "--project=desktop"
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ADMIN_SUPABASE_INTEGRATION: "1",
      SUPABASE_INTEGRATION_URL: localEnvironment.API_URL,
      SUPABASE_INTEGRATION_PUBLISHABLE_KEY: localEnvironment.PUBLISHABLE_KEY,
      SUPABASE_INTEGRATION_SECRET_KEY: localEnvironment.SECRET_KEY,
      SUPABASE_SECRET_KEY: localEnvironment.SECRET_KEY
    }
  }
);

process.exit(result.status ?? 1);
