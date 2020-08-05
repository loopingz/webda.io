# `codemod`

This package provides helper to migrate from one version to another

## Usage

```
yarn add --dev @webda/codemod
# If typescript
npx jscodeshift --parser ts -t node_modules/@webda/codemod/${script}.js src/**/*.ts
```

### webda-0.11-1.0

This script will move all imports `webda` or `webda-*` to `@webda/core` or `@webda/*`

It will also update any reference of `Executor` from `webda` to `Service` from `@webda/core`

It upgrade methods `checkCSRF` to `checkRequest`

# Recast issue

If you see parenthesis with destructed assignement
