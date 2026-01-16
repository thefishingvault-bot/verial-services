import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "jsdom",
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup-tests.tsx"],
    include: ["**/*.test.tsx"],
    exclude: ["tests/e2e/**", "**/node_modules/**"],
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
