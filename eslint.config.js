import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import unusedImports from "eslint-plugin-unused-imports";
import jsdoc from "eslint-plugin-jsdoc";

export default [
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "**/node_modules/**",
      "**/lib/**",
      "**/reports/**",
      "**/coverage/**",
      "**/vendor/**",
      "packages/debug/webui/**", "packages/debug-ui/dist/**",
      "packages/compiler/test/**",
      "packages/content-mapper/test/**",
      "packages/compiler/other.ts",
      "**/.webda.d.ts",
      "packages/cloudevents/src/models/filters/sql/CESQL*.ts",
      "packages/ql/src/WebdaQL*.ts",
      "docs/**"
    ]
  },
  {
    plugins: {
      "unused-imports": unusedImports,
      jsdoc
    },
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/*.spec.ts", "**/*.spec.tsx", "**/src/test/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      "@typescript-eslint/no-unused-vars": ["off", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "with-single-extends", allowObjectTypes: "always" }
      ],
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
          checkConstructors: true
        }
      ],
      "jsdoc/require-param": ["error", { exemptedBy: ["override"] }],
      "jsdoc/require-param-description": "error",
      "jsdoc/require-returns": ["error", { exemptedBy: ["override"] }],
      "jsdoc/require-returns-description": "error"
    }
  },
  {
    plugins: {
      "unused-imports": unusedImports
    },
    files: ["**/*.spec.ts", "**/*.spec.tsx", "**/src/test/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      "@typescript-eslint/no-unused-vars": ["off", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "with-single-extends", allowObjectTypes: "always" }
      ],
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-useless-escape": "off",
      "no-console": "off",
      "func-names": ["error", "always"],
      strict: ["error", "global"]
    }
  },
  {
    // React components receive one `props` object: documenting it as a whole is enough
    files: ["**/*.tsx"],
    ignores: ["**/*.spec.tsx"],
    rules: {
      "jsdoc/require-param": ["error", { checkDestructured: false, enableFixer: false, checkTypesPattern: "^$" }]
    }
  }
];
