import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "node",
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup-node.ts"],
    include: [
      "src/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/*.test.ts",
    ],
    exclude: ["**/*.test.tsx", "tests/e2e/**", "**/node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
