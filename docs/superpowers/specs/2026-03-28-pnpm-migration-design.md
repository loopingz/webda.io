# pnpm Migration + Dependency Update

**Date:** 2026-03-28
**Status:** Approved
**Scope:** Migrate from Yarn Classic + Lerna + Nx to pnpm, update all dependencies to latest

## Context

The webda.io monorepo (29 packages + sample apps) currently uses:
- **Yarn Classic 1.22** for package management and workspaces
- **Lerna 8** (independent versioning) for publishing
- **Nx 22** for build orchestration and caching

The goal is to simplify the toolchain to **pnpm only** — using pnpm workspaces, pnpm's topological run for build ordering, and pnpm's built-in publish. All dependencies will be updated to their latest versions.

## Design

### 1. Toolchain Swap

**Remove:**
- `yarn.lock` (root, `sample-app/`, `docs/`)
- `lerna.json`
- `nx.json`
- `lerna` and `nx` from root `devDependencies`
- `workspaces` field from root `package.json`
- `resolutions` and `overrides` fields from root `package.json`

**Add:**
- `pnpm-workspace.yaml`:
  ```yaml
  packages:
    - packages/*
    - sample-app
    - sample-apps/*
  ```
- `.npmrc` with `shamefully-hoist=true`
- `packageManager` field in root `package.json` (e.g., `"packageManager": "pnpm@10.32.0"`)
- `pnpm.overrides` in root `package.json` to replace `resolutions`/`overrides`:
  ```json
  "pnpm": {
    "overrides": {
      "whatwg-url": "^14.0.0"
    }
  }
  ```

### 2. Root Script Replacements

| Current (yarn/nx) | New (pnpm) |
|---|---|
| `nx run-many --target=build` | `pnpm -r run build` |
| `nx build @webda/sample-app` | `pnpm --filter @webda/sample-app run build` |
| `nx run-many --target=test --exclude @webda/sample-app` | `pnpm -r --filter=!@webda/sample-app run test` |
| `nx run-many --target=lint` | `pnpm -r run lint` |
| `nx run-many --target=lint:fix` | `pnpm -r run lint:fix` |
| `yarn run nx run @webda/shell:test` | `pnpm --filter @webda/shell run test` |
| `yarn run nx deps:graph` | `pnpm -r run deps:graph` |
| `lerna version ...` | Manual or `pnpm -r exec pnpm version <ver>` |
| `lerna publish` | `pnpm -r publish` |

Build ordering: `pnpm -r run build` executes in topological order based on workspace dependency graph.

Husky init script: Update from `husky install` to `husky` (v9+ syntax).

### 3. Package-level Changes

- Replace any `yarn` references in package scripts with `pnpm` (known: `packages/compiler/package.json`)
- Scan all packages for other yarn references

### 4. CI Workflow Updates (6 files)

All `.github/workflows/*.yml` files:
- Add `pnpm/action-setup` step (pinned by SHA) before `actions/setup-node`
- Replace all `yarn install` with `pnpm install`
- Replace all `yarn run <x>` with `pnpm run <x>`
- Replace all `yarn <x>` with `pnpm <x>`
- **release-please.yml**: Replace `lerna publish from-package --yes` with `pnpm -r publish --no-git-checks`
- **update-webda-module.yml**: Replace `yarn && yarn build` with `pnpm install && pnpm run build`

### 5. Dependency Updates

- Run `pnpm update -r --latest` to bump all dependencies to latest major versions
- Fix any resulting build/type errors

### 6. Cleanup

Delete:
- `yarn.lock` (root)
- `sample-app/yarn.lock`
- `docs/yarn.lock`
- `lerna.json`
- `nx.json`

Update documentation:
- `CLAUDE.md` — replace yarn/lerna/nx commands with pnpm equivalents
- `AGENTS.md` — same
- `.github/copilot-instructions.md` — same (if applicable)

## Out of Scope

- Changing the Node version matrix in CI
- Changing the test framework (Vitest/Mocha)
- Changing the release-please bot configuration (beyond the publish command)
- Removing `shamefully-hoist` (can be tightened in a follow-up)
