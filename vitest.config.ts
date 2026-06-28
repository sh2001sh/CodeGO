import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setupGlobals.ts", "./tests/setupTests.ts"],
    globals: true,
    include: ["tests/**/*.{test,spec}.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    exclude: ["scripts/**/*.test.mjs"],
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
