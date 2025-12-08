import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup-tests.tsx"],
    exclude: ["**/node_modules/**", "tests/e2e/**"],
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
  esbuild: {
    loader: "tsx",
    include: [/\.tsx?$/],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
