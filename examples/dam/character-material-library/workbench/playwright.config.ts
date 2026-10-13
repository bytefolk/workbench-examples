import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/browser.spec.ts",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4317",
    headless: true,
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:4317",
    reuseExistingServer: true,
  },
  reporter: "list",
});
