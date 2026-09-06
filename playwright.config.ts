import { defineConfig, devices } from "@playwright/test";

const chromeExecutable = process.env.PLAYWRIGHT_CHROME_EXECUTABLE;
const runSupabaseIntegration = process.env.ADMIN_SUPABASE_INTEGRATION === "1";
const productionBuild = process.env.PLAYWRIGHT_PRODUCTION === "1";
if (productionBuild && !runSupabaseIntegration) {
  throw new Error("Production browser tests require the real local Supabase integration setup, not test-mode fixtures.");
}
const port = Number(process.env.PLAYWRIGHT_PORT ?? (runSupabaseIntegration ? 3010 : 3000));
const baseURL = `${productionBuild ? "https" : "http"}://127.0.0.1:${port}`;
const integrationUrl = process.env.SUPABASE_INTEGRATION_URL;
const integrationPublishableKey = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY;

if (runSupabaseIntegration && (!integrationUrl || !integrationPublishableKey)) {
  throw new Error("The local Supabase integration URL and publishable key are required.");
}

const inheritedServerEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && entry[0] !== "SUPABASE_INTEGRATION_SECRET_KEY"
  )
);

const serverEnvironment = runSupabaseIntegration
  ? {
      ...inheritedServerEnvironment,
      ADMIN_TEST_MODE: "0",
      NEXT_PUBLIC_SUPABASE_URL: integrationUrl!,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: integrationPublishableKey!,
      BETA_PASSWORD: "integration-beta-password",
      LEARNER_COOKIE_SECRET: "integration-learner-cookie-secret"
    }
  : {
      ...inheritedServerEnvironment,
      BETA_PASSWORD: "test-beta-password",
      LEARNER_COOKIE_SECRET: "test-cookie-secret",
      ADMIN_TEST_MODE: "1",
      ADMIN_TEST_EMAIL: "admin@example.com",
      ADMIN_TEST_OTP: "123456",
      ADMIN_TEST_SESSION_SECRET: "test-admin-cookie-secret"
    };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL,
    ignoreHTTPSErrors: productionBuild,
    trace: "on-first-retry",
    launchOptions: chromeExecutable ? { executablePath: chromeExecutable } : undefined
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 5"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } }
  ],
  webServer: {
    command: productionBuild
      ? `node scripts/start-production-test-server.mjs ${port}`
      : `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    env: serverEnvironment,
    url: baseURL,
    ignoreHTTPSErrors: productionBuild,
    reuseExistingServer: runSupabaseIntegration ? false : !process.env.CI
  }
});
