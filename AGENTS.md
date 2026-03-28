# Webda.io Agent Guidelines

## Commands

- **Build**: `yarn build` (Package) or `nx run-many --target=build` (Root).
- **Test**: `yarn test` (All).
- **Lint/Format**: `yarn lint` / `yarn format`.

## Code Style & Conventions

- **TypeScript**: ESNext, strict: true. Use ESM imports.
- **Architecture**: DDD. Models (`@Model`) -> Services (`@Bean`).
- **Dependency Injection**: ALWAYS use DI. NEVER manually instantiate Services.
- **Logging**: Use `useLog` from `@webda/workout`.
- **Errors**: Throw `WebdaError` subclasses (import from `@webda/core/errors`).
- **Naming**: PascalCase (Classes), camelCase (Methods/Vars).
- **Lifecycle**: Respect `resolve()` -> `init()` service lifecycle.

## Rules

- **Context**: See `.github/copilot-instructions.md` for deep architectural rules.
- **Files**: Use absolute paths. Do not edit generated files (e.g. \*.schema.json).
- **Config**: Do not modify `package.json`/`tsconfig.json` unless requested.

FORBIDDEN ITEMS:

- Do not use `npx`
