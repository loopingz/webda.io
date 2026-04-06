import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import unusedImports from "eslint-plugin-unused-imports";
import jsdoc from "eslint-plugin-jsdoc";

export default [
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/node_modules/**", "**/lib/**", "**/reports/**", "**/coverage/**", "packages/schema/test/fixtures/**", "packages/schema/test/vega-fixtures/**", "packages/schema/test/webda/**", "packages/compiler/test/**", "packages/compiler/other.ts", "**/.webda.d.ts"]
  },
  {
    plugins: {
      "unused-imports": unusedImports,
      jsdoc
    },
    files: ["**/*.ts"],
    ignores: ["**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      "@typescript-eslint/no-unused-vars": ["off", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends", allowObjectTypes: "always" }],
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-useless-escape": "off",
      "no-console": "off",
      "func-names": ["error", "always"],
      strict: ["error", "global"],
      "jsdoc/require-jsdoc": [
        "error",
        {
          require: {
            ClassDeclaration: true,
            MethodDefinition: true,
            FunctionDeclaration: true
          },
          checkConstructors: false
        }
      ],
      "jsdoc/require-param": ["error", { checkConstructors: false }],
      "jsdoc/require-param-description": "error",
      "jsdoc/require-returns": ["error", { checkConstructors: false }],
      "jsdoc/require-returns-description": "error"
    }
  },
  {
    plugins: {
      "unused-imports": unusedImports
    },
    files: ["**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      "@typescript-eslint/no-unused-vars": ["off", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends", allowObjectTypes: "always" }],
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-useless-escape": "off",
      "no-console": "off",
      "func-names": ["error", "always"],
      strict: ["error", "global"]
    }
  }
];
