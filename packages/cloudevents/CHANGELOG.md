# Changelog

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/cloudevents-v4.0.0-beta.2...cloudevents-v4.0.0-beta.3) (2026-10-05)


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
* remove node 18 support

### Features

* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* add option to register filter type ([8fb4670](https://github.com/loopingz/webda.io/commit/8fb46708b0f3b3c74c28f87a30f24f6949419eaf))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* **cloudevents:** add isCloudEvent() duck-typing validation ([#746](https://github.com/loopingz/webda.io/issues/746)) ([afcdf66](https://github.com/loopingz/webda.io/commit/afcdf668f50f6ea85e331453bea966d81912badb))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))


### Bug Fixes

* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.3

## [4.0.0-beta.2](https://github.com/loopingz/webda.io/compare/cloudevents-v4.0.0-beta.1...cloudevents-v4.0.0-beta.2) (2024-08-14)


### Features

* **cloudevents:** add index exporter ([2794fb1](https://github.com/loopingz/webda.io/commit/2794fb10a86bd911a8db532a596c1d0394c68202))

## 4.0.0-beta.1 (2024-08-14)


### Features

* **cloudevents:** add module ([562f4a9](https://github.com/loopingz/webda.io/commit/562f4a929e6cb3931a07d9db23d3e1b596272d16))


### Bug Fixes

* codeql warn ([9aa445f](https://github.com/loopingz/webda.io/commit/9aa445fa052dc434df6d8eb04bc1bb2d484f1f2d))


### Miscellaneous Chores

* prepare version for 4.0 ([24e8e78](https://github.com/loopingz/webda.io/commit/24e8e789b8e4ac2364ac0d1669b115237ff4be6d))


### Continuous Integration

* update additional modules ([77b32e9](https://github.com/loopingz/webda.io/commit/77b32e9dbd950ddaebe11cda22c20d71ab7f309a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/tsc-esm bumped from 1.3.0 to 4.0.0-beta.1
