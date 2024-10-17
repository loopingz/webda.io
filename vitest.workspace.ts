import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "./packages/compiler/vitest.config.ts",
  "./packages/core/vitest.config.ts",
  "./packages/test/vitest.config.ts",
  "./packages/utils/vitest.config.ts"
]);
