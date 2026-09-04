import { defineConfig, devices } from "@playwright/test";

const chromeExecutable = process.env.PLAYWRIGHT_CHROME_EXECUTABLE;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    launchOptions: chromeExecutable ? { executablePath: chromeExecutable } : undefined
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 5"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } }
  ],
  webServer: {
    command: "BETA_PASSWORD=test-beta-password LEARNER_COOKIE_SECRET=test-cookie-secret npm run dev -- --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI
  }
});
