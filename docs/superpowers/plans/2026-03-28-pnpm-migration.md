# pnpm Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate from Yarn Classic + Lerna + Nx to pnpm-only, and update all dependencies to latest.

**Architecture:** Replace Yarn workspaces with `pnpm-workspace.yaml`, remove Lerna/Nx entirely, use `pnpm -r` for recursive workspace operations with topological ordering. Update all CI workflows, scripts, docs, and hooks.

**Tech Stack:** pnpm 10.32.0, Node.js >= 22, GitHub Actions

---

### Task 1: Remove Yarn/Lerna/Nx Config Files

**Files:**
- Delete: `lerna.json`
- Delete: `nx.json`
- Delete: `yarn.lock`
- Delete: `sample-app/yarn.lock`
- Delete: `docs/yarn.lock`
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`

- [ ] **Step 1: Delete config files**

```bash
rm /Users/loopingz/Git/loopingz/webda.io/lerna.json
rm /Users/loopingz/Git/loopingz/webda.io/nx.json
rm /Users/loopingz/Git/loopingz/webda.io/yarn.lock
rm /Users/loopingz/Git/loopingz/webda.io/sample-app/yarn.lock
rm /Users/loopingz/Git/loopingz/webda.io/docs/yarn.lock
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

Write to `/Users/loopingz/Git/loopingz/webda.io/pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
  - sample-app
  - sample-apps/*
```

- [ ] **Step 3: Create `.npmrc`**

Write to `/Users/loopingz/Git/loopingz/webda.io/.npmrc`:

```ini
shamefully-hoist=true
```

- [ ] **Step 4: Commit**

```bash
git add -A lerna.json nx.json yarn.lock sample-app/yarn.lock docs/yarn.lock pnpm-workspace.yaml .npmrc
git commit -m "chore: remove yarn/lerna/nx config, add pnpm workspace config"
```

---

### Task 2: Update Root package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove `workspaces` field**

Remove:
```json
"workspaces": [
    "packages/*",
    "sample-app",
    "sample-apps/*"
  ],
```

- [ ] **Step 2: Add `packageManager` field**

Add after `"private": true,`:
```json
"packageManager": "pnpm@10.32.0",
```

- [ ] **Step 3: Remove `lerna` and `nx` from devDependencies**

Remove these lines from `devDependencies`:
```json
"lerna": "^8.0.0",
"nx": "^22.2.0",
```

- [ ] **Step 4: Replace `resolutions` and `overrides` with `pnpm.overrides`**

Remove:
```json
"overrides": {
    "whatwg-url": "^14.0.0"
  },
  "resolutions": {
    "whatwg-url": "^14.0.0"
  },
```

Add:
```json
"pnpm": {
    "overrides": {
      "whatwg-url": "^14.0.0"
    }
  },
```

- [ ] **Step 5: Update scripts**

Replace the entire `scripts` section with:
```json
"scripts": {
    "build": "pnpm -r run build",
    "build:ci": "pnpm --filter @webda/sample-app run build",
    "test": "pnpm -r --filter=!@webda/sample-app run test",
    "new-version": "pnpm run build && pnpm -r exec pnpm version --no-git-tag-version",
    "new-module": "pnpm webda init webda:module",
    "lint": "pnpm -r run lint",
    "lint:fix": "pnpm -r run lint:fix",
    "publish:all": "pnpm -r publish",
    "docs": "cd docs && pnpm run update:typedoc && pnpm run build && echo 'webda.io' > build/CNAME",
    "docs:publish": "pnpm run docs && gh-pages -t -d docs/build",
    "deps:graph": "pnpm -r run deps:graph",
    "init": "husky"
  },
```

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "chore: update root package.json for pnpm"
```

---

### Task 3: Update Package-level Scripts

**Files:**
- Modify: `packages/compiler/package.json` (line 26)
- Modify: `packages/cloudevents/package.json` (line 16)
- Modify: `packages/ql/package.json` (line 14)

- [ ] **Step 1: Fix compiler pretest**

In `packages/compiler/package.json`, replace:
```json
"pretest": "yarn build",
```
with:
```json
"pretest": "pnpm run build",
```

- [ ] **Step 2: Fix cloudevents grammar script**

In `packages/cloudevents/package.json`, replace:
```json
"grammar": "antlr4ts -visitor src/stores/webdaql/WebdaQLLexer.g4 src/stores/webdaql/WebdaQLParser.g4 && yarn run lint:fix",
```
with:
```json
"grammar": "antlr4ts -visitor src/stores/webdaql/WebdaQLLexer.g4 src/stores/webdaql/WebdaQLParser.g4 && pnpm run lint:fix",
```

- [ ] **Step 3: Fix ql grammar script**

In `packages/ql/package.json`, replace:
```json
"grammar": "antlr4ts -visitor src/WebdaQLLexer.g4 src/WebdaQLParser.g4 && yarn run lint:fix",
```
with:
```json
"grammar": "antlr4ts -visitor src/WebdaQLLexer.g4 src/WebdaQLParser.g4 && pnpm run lint:fix",
```

- [ ] **Step 4: Commit**

```bash
git add packages/compiler/package.json packages/cloudevents/package.json packages/ql/package.json
git commit -m "chore: replace yarn with pnpm in package scripts"
```

---

### Task 4: Update Husky Hooks

**Files:**
- Modify: `.husky/commit-msg`
- Modify: `.husky/pre-commit`
- Modify: `.husky/pre-push`

- [ ] **Step 1: Update commit-msg hook**

Replace full content of `.husky/commit-msg` with:
```sh
pnpm exec commitlint --edit $1
```

(Remove the old `#!/bin/sh` + `. "$(dirname "$0")/_/husky.sh"` preamble — husky v9 doesn't need it.)

- [ ] **Step 2: Update pre-commit hook**

Replace full content of `.husky/pre-commit` with:
```sh
pnpm run lint:fix
```

- [ ] **Step 3: Update pre-push hook**

Replace full content of `.husky/pre-push` with:
```sh
#pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add .husky/commit-msg .husky/pre-commit .husky/pre-push
git commit -m "chore: update husky hooks for pnpm and husky v9"
```

---

### Task 5: Update CI Workflow — ci.yml

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add pnpm setup step after checkout, before setup-node**

Insert after `uses: actions/checkout@v4` step (line 54) and before `uses: actions/setup-node@v4` step (line 56):

```yaml
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
```

- [ ] **Step 2: Replace all yarn commands**

Replace:
```yaml
      - name: Install dependencies
        run: yarn install

      - name: Build
        run: yarn run build:ci # Build is required as we use sample-app for some tests

      - name: Run tests
        run: yarn run test --exclude @webda/shell
```
with:
```yaml
      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm run build:ci # Build is required as we use sample-app for some tests

      - name: Run tests
        run: pnpm -r --filter=!@webda/shell run test
```

Replace:
```yaml
      - name: Run shell tests
        run: yarn run nx run @webda/shell:test
```
with:
```yaml
      - name: Run shell tests
        run: pnpm --filter @webda/shell run test
```

Replace:
```yaml
      - name: Check for circular dependencies
        run: yarn run nx deps:graph
```
with:
```yaml
      - name: Check for circular dependencies
        run: pnpm run deps:graph
```

Replace:
```yaml
      - name: Lint
        run: yarn run lint
```
with:
```yaml
      - name: Lint
        run: pnpm run lint
```

Replace:
```yaml
      - name: Check with mocha
        run: yarn run test:mocha

      - name: Check with jest
        run: yarn run test:jest

      - name: Check with bun
        run: yarn run test:bun
```
with:
```yaml
      - name: Check with mocha
        run: pnpm run test:mocha

      - name: Check with jest
        run: pnpm run test:jest

      - name: Check with bun
        run: pnpm run test:bun
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: migrate ci.yml from yarn/nx to pnpm"
```

---

### Task 6: Update CI Workflow — docs.yml

**Files:**
- Modify: `.github/workflows/docs.yml`

- [ ] **Step 1: Add pnpm setup and update commands**

Replace the full steps section (lines 13-34) with:

```yaml
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: pnpm install && cd docs && pnpm install

      - name: Build docs
        env:
          NODE_OPTIONS: "--max-old-space-size=8192"
        run: pnpm run docs

      - name: Deploy
        uses: JamesIves/github-pages-deploy-action@4.1.4
        with:
          branch: gh-pages
          folder: docs/dist
```

(Also bump setup-node to v4 and node-version to 22.)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/docs.yml
git commit -m "ci: migrate docs.yml from yarn to pnpm"
```

---

### Task 7: Update CI Workflow — release-please.yml

**Files:**
- Modify: `.github/workflows/release-please.yml`

- [ ] **Step 1: Add pnpm setup and update commands**

Insert `pnpm/action-setup` step after `actions/setup-node` (line 22), with same `if` condition:

```yaml
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
        if: ${{ steps.release.outputs.release_created }}
```

Replace line 34:
```yaml
        run: yarn && yarn run build
```
with:
```yaml
        run: pnpm install && pnpm run build
```

Replace line 38:
```yaml
        run: yarn run lerna:publish from-package --yes
```
with:
```yaml
        run: pnpm -r publish --no-git-checks
```

Replace line 44:
```yaml
        run: cd docs && yarn install
```
with:
```yaml
        run: cd docs && pnpm install
```

Replace line 50:
```yaml
        run: yarn docs
```
with:
```yaml
        run: pnpm run docs
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release-please.yml
git commit -m "ci: migrate release-please.yml from yarn/lerna to pnpm"
```

---

### Task 8: Update CI Workflow — update-webda-module.yml

**Files:**
- Modify: `.github/workflows/update-webda-module.yml`

- [ ] **Step 1: Add pnpm setup and update commands**

The current workflow (lines 13-17) is incomplete — it has a `run` but no `checkout` or `setup-node`. Add the missing steps and replace yarn:

```yaml
jobs:
  ensure-module:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Build
        run: pnpm install && pnpm run build
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/update-webda-module.yml
git commit -m "ci: migrate update-webda-module.yml from yarn to pnpm"
```

---

### Task 9: Install Dependencies and Generate Lock File

**Files:**
- Create: `pnpm-lock.yaml` (auto-generated)

- [ ] **Step 1: Remove node_modules**

```bash
rm -rf node_modules packages/*/node_modules sample-app/node_modules sample-apps/*/node_modules docs/node_modules
```

- [ ] **Step 2: Run pnpm install**

```bash
cd /Users/loopingz/Git/loopingz/webda.io && pnpm install
```

Expected: creates `pnpm-lock.yaml` and `node_modules` with symlinked workspace packages.

- [ ] **Step 3: Verify workspace links**

```bash
pnpm ls -r --depth 0 2>&1 | head -50
```

Expected: shows all workspace packages with their versions.

- [ ] **Step 4: Commit lock file**

```bash
git add pnpm-lock.yaml
git commit -m "chore: add pnpm-lock.yaml"
```

---

### Task 10: Update All Dependencies to Latest

**Files:**
- Modify: all `package.json` files (root + packages)
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Update all dependencies to latest**

```bash
cd /Users/loopingz/Git/loopingz/webda.io && pnpm update -r --latest
```

- [ ] **Step 2: Verify install succeeds**

```bash
pnpm install
```

Expected: clean install with no errors.

- [ ] **Step 3: Commit**

```bash
git add -A '*.json' pnpm-lock.yaml
git commit -m "chore: update all dependencies to latest"
```

---

### Task 11: Build and Fix Errors

**Files:**
- Potentially modify: any source files with type/API breakage from major dep bumps

- [ ] **Step 1: Run build**

```bash
cd /Users/loopingz/Git/loopingz/webda.io && pnpm -r run build
```

- [ ] **Step 2: Fix any build errors**

If there are TypeScript compilation errors from major dependency updates, fix them. Common issues:
- Type changes in updated `@types/*` packages
- Breaking API changes in major version bumps
- ESM/import path changes

- [ ] **Step 3: Run build again to verify**

```bash
pnpm -r run build
```

Expected: all packages build successfully.

- [ ] **Step 4: Commit fixes (if any)**

```bash
git add -A
git commit -m "fix: resolve build errors from dependency updates"
```

---

### Task 12: Run Tests and Fix Failures

**Files:**
- Potentially modify: test files with API breakage

- [ ] **Step 1: Run tests**

```bash
cd /Users/loopingz/Git/loopingz/webda.io && pnpm -r --filter=!@webda/sample-app run test
```

- [ ] **Step 2: Fix any test failures**

Fix failures caused by dependency API changes. Do not fix pre-existing failures unrelated to the migration.

- [ ] **Step 3: Run tests again to verify**

```bash
pnpm -r --filter=!@webda/sample-app run test
```

Expected: tests pass (same pass rate as before migration).

- [ ] **Step 4: Commit fixes (if any)**

```bash
git add -A
git commit -m "fix: resolve test failures from dependency updates"
```

---

### Task 13: Update Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `.github/copilot-instructions.md`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Update AGENTS.md**

Replace lines 5-7:
```markdown
- **Build**: `yarn build` (Package) or `nx run-many --target=build` (Root).
- **Test**: `yarn test` (All).
- **Lint/Format**: `yarn lint` / `yarn format`.
```
with:
```markdown
- **Build**: `pnpm run build` (Package) or `pnpm -r run build` (Root).
- **Test**: `pnpm test` (All).
- **Lint/Format**: `pnpm run lint` / `pnpm run format`.
```

- [ ] **Step 2: Update .github/copilot-instructions.md**

Replace lines 43-50:
```markdown
yarn new-module     # Create new package in monorepo
yarn new-service    # Generate service boilerplate
yarn new-model      # Generate domain model

# Building and testing
nx run-many --target=build     # Build all packages
nx run-many --target=test      # Run all tests
yarn build:ci                  # CI-specific build
```
with:
```markdown
pnpm new-module     # Create new package in monorepo
pnpm new-service    # Generate service boilerplate
pnpm new-model      # Generate domain model

# Building and testing
pnpm -r run build              # Build all packages
pnpm -r run test               # Run all tests
pnpm run build:ci              # CI-specific build
```

Replace lines 86-88:
```markdown
### Monorepo with Nx + Lerna
- **Nx**: Handles build dependencies and caching (`nx.json`)
- **Lerna**: Manages package versioning and publishing
```
with:
```markdown
### Monorepo with pnpm Workspaces
- **pnpm**: Handles workspaces, build orchestration, and publishing
```

Replace lines 121-122:
```markdown
yarn test               # All tests
yarn test -t "MyTest"   # Specific test
```
with:
```markdown
pnpm test               # All tests
pnpm test -t "MyTest"   # Specific test
```

- [ ] **Step 3: Update README.md**

Replace lines 38, 46, 54:
```markdown
yarn new-module
```
```markdown
yarn new-service
```
```markdown
yarn new-model
```
with:
```markdown
pnpm new-module
```
```markdown
pnpm new-service
```
```markdown
pnpm new-model
```

- [ ] **Step 4: Update CONTRIBUTING.md**

Replace lines 23-35:
```markdown
You can use your development version with the `yarn link` option

In the root of webda.io repository type

```
lerna link
```

Then in your target project just type

```
yarn link @webda/core
```
```
with:
```markdown
You can use your development version with the `pnpm link` option

In the root of webda.io repository type

```
pnpm link --global
```

Then in your target project just type

```
pnpm link --global @webda/core
```
```

Replace line 52:
```markdown
yarn new-version
```
with:
```markdown
pnpm run new-version
```

- [ ] **Step 5: Update CLAUDE.md**

Replace all `yarn` commands with `pnpm` equivalents, all `nx` commands with `pnpm -r`, and all Lerna references with pnpm. Key replacements:

Line 23: `Monorepo root (Lerna + Nx + Yarn workspaces)` → `Monorepo root (pnpm workspaces)`

Lines 43-45:
```markdown
yarn new-module                     # Create new package in monorepo
yarn new-service                    # Generate service boilerplate
yarn new-model                      # Generate domain model
```
→
```markdown
pnpm new-module                     # Create new package in monorepo
pnpm new-service                    # Generate service boilerplate
pnpm new-model                      # Generate domain model
```

Lines 216-237: Replace all `nx run-many --target=X` with `pnpm -r run X`, all `yarn X` with `pnpm run X`.

Lines 709-711:
```markdown
- **Lerna**: Version management and publishing (`lerna.json`)
- **Nx**: Build orchestration and caching (`nx.json`)
- **Yarn Workspaces**: Dependency hoisting (`package.json` workspaces)
```
→
```markdown
- **pnpm Workspaces**: Package management, build orchestration, and publishing (`pnpm-workspace.yaml`)
```

Lines 740-741, 743:
```markdown
yarn build
yarn test
yarn lint
```
→
```markdown
pnpm run build
pnpm test
pnpm run lint
```

Lines 754-758:
```markdown
lerna link

yarn link @webda/core
yarn link @webda/shell
```
→
```markdown
pnpm link --global

pnpm link --global @webda/core
pnpm link --global @webda/shell
```

Lines 763-764:
```markdown
yarn new-version  # Bumps versions, creates tags
yarn lerna:publish  # Publishes to npm
```
→
```markdown
pnpm run new-version  # Bumps versions, creates tags
pnpm -r publish       # Publishes to npm
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md AGENTS.md .github/copilot-instructions.md README.md CONTRIBUTING.md
git commit -m "docs: update all documentation from yarn/lerna/nx to pnpm"
```

---

### Task 14: Final Verification

- [ ] **Step 1: Clean install from scratch**

```bash
rm -rf node_modules packages/*/node_modules sample-app/node_modules sample-apps/*/node_modules docs/node_modules
pnpm install
```

- [ ] **Step 2: Full build**

```bash
pnpm -r run build
```

Expected: all packages build cleanly.

- [ ] **Step 3: Full test suite**

```bash
pnpm -r --filter=!@webda/sample-app run test
```

Expected: tests pass.

- [ ] **Step 4: Lint**

```bash
pnpm -r run lint
```

Expected: no lint errors.

- [ ] **Step 5: Verify no stale yarn/lerna/nx references remain**

```bash
grep -r "yarn " --include="*.json" --include="*.yml" --include="*.yaml" --include="*.md" --include="*.sh" . --exclude-dir=node_modules --exclude-dir=lib --exclude-dir=.git --exclude-dir=docs/superpowers | grep -v "pnpm-lock" | grep -v CHANGELOG
```

Expected: no results (or only inside vendored/third-party content).
