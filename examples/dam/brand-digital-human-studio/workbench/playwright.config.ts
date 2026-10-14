import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/browser.spec.ts",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4179",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "node ../../../../scripts/serve.mjs",
    env: { PORT: "4179" },
    url: "http://127.0.0.1:4179",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
