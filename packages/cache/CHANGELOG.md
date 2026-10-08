# Changelog

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/cache-v4.0.0-beta.3...cache-v4.0.0-beta.4) (2026-10-08)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/cache-v4.0.0-beta.1...cache-v4.0.0-beta.3) (2026-10-05)


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

* add @webda/cache module ease-up cache system ([06f31d4](https://github.com/loopingz/webda.io/commit/06f31d40cedb035243acb00c7dca9c7eea39cd4a))
* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add conditional caching and hashStrategy ([b101dcb](https://github.com/loopingz/webda.io/commit/b101dcb99a03314f89084f53f74859c1fb9778ab))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* add ObjectStorage cache stored directly on the instance ([11d9e19](https://github.com/loopingz/webda.io/commit/11d9e194af480d9357e40899cf44ac4aa26010a6))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* improve caching module ([08b2db5](https://github.com/loopingz/webda.io/commit/08b2db5d96cc4553d5ff2919cbf00287192b4ff6))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* update @webda/cache module ([8cb32c3](https://github.com/loopingz/webda.io/commit/8cb32c3570995f34fc0d3a5221fcd495a82b9f05))


### Bug Fixes

* 'this' context in cache ([24d2166](https://github.com/loopingz/webda.io/commit/24d216665c9e592000aedac2359b91fc37b93b01))
* symlink isMainModule ([7918dd1](https://github.com/loopingz/webda.io/commit/7918dd1704a3efff2afee7cf424d14d402b331e2))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.3
    * @webda/decorators bumped to 4.0.0-beta.3
    * @webda/test bumped to 4.0.0-beta.3
