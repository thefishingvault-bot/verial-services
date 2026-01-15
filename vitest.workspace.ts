import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "./vitest.node.config.ts",
  "./vitest.jsdom.config.ts",
]);
