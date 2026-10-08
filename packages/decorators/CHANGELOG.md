# Changelog

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/decorators-v4.0.0-beta.3...decorators-v4.0.0-beta.5) (2026-10-08)


### Bug Fixes

* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/decorators-v4.0.0-beta.1...decorators-v4.0.0-beta.3) (2026-10-05)


### ⚠ BREAKING CHANGES

* @webda/ts-plugin and the `tsc-esm` binary are removed, and applications now build with TypeScript 7.1. Generated code changes where TypeScript 6 was wrong, each verified against the shipped output:
    - AuditEntry.timestamp, declared `number`, is no longer coerced to Date;
    - AbstractOwnerModel no longer emits `new ModelLink(T)`, a ReferenceError
      on first raw-uuid assignment;
    - sample-app's `User extends WebdaUser` is now treated as a model (TS6's
      base-chain guard was keyed on class name), so its relations are
      initialised and coerced;
    - imports use the specifier the author wrote, not monorepo-relative paths
      that only resolve inside this repository;
    - the emitted .d.ts is valid (TS6 referenced PrimaryKeyType unimported and
      wrote BelongTo without its type argument).
    A build that cannot write its module now fails; under TS6 a strict
    file-naming violation was logged and the build still reported success.

### Features

* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* add new @webda/decorators module ([7c222f1](https://github.com/loopingz/webda.io/commit/7c222f19bd70891c688ed00c360f5733a94a2b7e))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* update @webda/cache module ([8cb32c3](https://github.com/loopingz/webda.io/commit/8cb32c3570995f34fc0d3a5221fcd495a82b9f05))
* use symbols for relations ([8e3e0d0](https://github.com/loopingz/webda.io/commit/8e3e0d0ea6df92692b24e5134409e54b1bc55e50))


### Bug Fixes

* move @webda/decorators to strict mode ([532da54](https://github.com/loopingz/webda.io/commit/532da54a2562b1663f404aa3fdf2bf010912b79f))
* move to nodenext module and update Inject annotation ([d7d85e4](https://github.com/loopingz/webda.io/commit/d7d85e4dc2a73fce5e63429c02663d980515b667))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))
