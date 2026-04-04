import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    extends: "packages/cache/vitest.config.ts",
    test: { name: "cache", root: "packages/cache" }
  },
  {
    extends: "packages/cloudevents/vitest.config.ts",
    test: { name: "cloudevents", root: "packages/cloudevents" }
  },
  {
    extends: "packages/compiler/vitest.config.ts",
    test: { name: "compiler", root: "packages/compiler" }
  },
  {
    extends: "packages/core/vitest.config.ts",
    test: { name: "core", root: "packages/core" }
  },
  {
    extends: "packages/decorators/vitest.config.ts",
    test: { name: "decorators", root: "packages/decorators" }
  },
  {
    extends: "packages/models/vitest.config.ts",
    test: { name: "models", root: "packages/models" }
  },
  {
    extends: "packages/ql/vitest.config.ts",
    test: { name: "ql", root: "packages/ql" }
  },
  {
    extends: "packages/schema/vitest.config.ts",
    test: { name: "schema", root: "packages/schema" }
  },
  {
    extends: "packages/serialize/vitest.config.ts",
    test: { name: "serialize", root: "packages/serialize" }
  },
  {
    extends: "packages/test/vitest.config.ts",
    test: { name: "test", root: "packages/test" }
  },
  {
    extends: "packages/ts-plugin/vitest.config.ts",
    test: { name: "ts-plugin", root: "packages/ts-plugin" }
  },
  {
    extends: "packages/tsc-esm/vitest.config.ts",
    test: { name: "tsc-esm", root: "packages/tsc-esm" }
  },
  {
    extends: "packages/utils/vitest.config.ts",
    test: { name: "utils", root: "packages/utils" }
  },
  {
    extends: "packages/workout/vitest.config.ts",
    test: { name: "workout", root: "packages/workout" }
  }
]);
