import { defineConfig, devices } from "@playwright/test";

// E2E roda contra um build de produção na porta 3457, usando o banco kroma_test e storage local.
const env = {
  DATABASE_URL: "postgresql://kroma:kroma@localhost:5434/kroma_test?schema=public",
  APP_URL: "http://localhost:3457",
  AUTH_SECRET: "e2e-only-secret-not-for-production-0000000",
  CRON_SECRET: "e2e-cron-secret",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: ".storage-test",
  RESEND_API_KEY: "",
  RESEND_FROM_EMAIL: "",
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: env.APP_URL,
    channel: process.env.PW_CHANNEL ?? "chrome",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL ?? "chrome", viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "npx next build && npx next start -p 3457",
    url: "http://localhost:3457/login",
    timeout: 300_000,
    reuseExistingServer: false,
    env,
  },
});
