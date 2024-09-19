//import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  { files: ["**/*.{js,mjs,cjs,ts}"] },
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    ignores: ["node_modules", "**/lib/*"]
  },
  //Overrides some tslint rules
  {
    plugins: {
      "unused-imports": unusedImports
    },
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      "@typescript-eslint/no-unused-vars": ["off", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends" }],
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-useless-escape": "off",
      "no-console": "off",
      "func-names": ["error", "always"],
      strict: ["error", "global"]
    }
  }
];
