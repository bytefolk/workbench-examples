import { defineConfig } from "@playwright/test";

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/browser.spec.ts",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4318",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH },
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:4318",
    reuseExistingServer: true,
  },
  reporter: "list",
});
