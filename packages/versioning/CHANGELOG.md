# Changelog

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/versioning-v4.0.0-beta.3...versioning-v4.0.0-beta.4) (2026-10-08)


### Bug Fixes

* **versioning:** support documents with a `_t` key ([#797](https://github.com/loopingz/webda.io/issues/797)) ([ff2d55e](https://github.com/loopingz/webda.io/commit/ff2d55e05c7e42f7fec3c3258a0189486554cee6))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/core bumped to 4.0.0-beta.4
    * @webda/models bumped to 4.0.0-beta.4
  * peerDependencies
    * @webda/core bumped to 4.0.0-beta.4
    * @webda/models bumped to 4.0.0-beta.4

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/versioning-v4.0.0-beta.1...versioning-v4.0.0-beta.3) (2026-10-05)


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
* **versioning:** add a library to create patch on objects ([a366fb5](https://github.com/loopingz/webda.io/commit/a366fb5df0f0eb1ca9e26fbb91ebe33e65dd4a89))


### Bug Fixes

* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/core bumped to 4.0.0-beta.3
    * @webda/models bumped to 4.0.0-beta.3
    * @webda/test bumped to 4.0.0-beta.3
  * peerDependencies
    * @webda/core bumped to 4.0.0-beta.3
    * @webda/models bumped to 4.0.0-beta.3
