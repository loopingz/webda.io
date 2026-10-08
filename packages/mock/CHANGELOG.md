# Changelog

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/mock-v4.0.0-beta.4...mock-v4.0.0-beta.5) (2026-10-08)


### Bug Fixes

* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/models bumped to 4.0.0-beta.5
  * devDependencies
    * @webda/core bumped to 4.0.0-beta.5
    * @webda/test bumped to 4.0.0-beta.5
  * peerDependencies
    * @webda/core bumped to 4.0.0-beta.5

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/mock-v4.0.0-beta.3...mock-v4.0.0-beta.4) (2026-10-08)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/models bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/core bumped to 4.0.0-beta.4
  * peerDependencies
    * @webda/core bumped to 4.0.0-beta.4

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/mock-v4.0.0-beta.1...mock-v4.0.0-beta.3) (2026-10-05)


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

* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* **mock:** add @webda/mock — coherent mock-data generation for models ([#761](https://github.com/loopingz/webda.io/issues/761)) ([c15a9b1](https://github.com/loopingz/webda.io/commit/c15a9b1b301ff42d99eac61affde6874dd78a0e4))


### Bug Fixes

* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/models bumped to 4.0.0-beta.3
  * devDependencies
    * @webda/core bumped to 4.0.0-beta.3
    * @webda/test bumped to 4.0.0-beta.3
  * peerDependencies
    * @webda/core bumped to 4.0.0-beta.3
