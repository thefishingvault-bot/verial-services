import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		exclude: ["**/node_modules/**", "tests/e2e/**"],
		coverage: {
			reporter: ["text", "lcov"],
		},
		projects: [
			{
				extends: true,
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
					exclude: ["**/*.test.tsx", "**/node_modules/**", "tests/e2e/**"],
				},
			},
			{
				extends: true,
				test: {
					name: "jsdom",
					globals: true,
					environment: "jsdom",
					setupFiles: ["./tests/setup-tests.tsx"],
					include: ["**/*.test.tsx"],
					exclude: ["**/node_modules/**", "tests/e2e/**"],
				},
			},
		],
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
