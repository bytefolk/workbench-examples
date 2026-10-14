import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${loadEnv(mode, process.cwd(), "API_").API_PORT || 8788}`,
    },
  },
  preview: {
    proxy: {
      "/api": `http://127.0.0.1:${loadEnv(mode, process.cwd(), "API_").API_PORT || 8788}`,
    },
  },
}));
