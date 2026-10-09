# Changelog

## [4.0.0-beta.6](https://github.com/loopingz/webda.io/compare/tsc-esm-v4.0.0-beta.5...tsc-esm-v4.0.0-beta.6) (2026-10-09)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.6

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/tsc-esm-v4.0.0-beta.3...tsc-esm-v4.0.0-beta.5) (2026-10-08)


### Bug Fixes

* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/decorators bumped to 4.0.0-beta.5
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.5

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/tsc-esm-v4.0.0-beta.1...tsc-esm-v4.0.0-beta.3) (2026-10-05)


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
* add new @webda/decorators module ([7c222f1](https://github.com/loopingz/webda.io/commit/7c222f19bd70891c688ed00c360f5733a94a2b7e))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* improve caching module ([08b2db5](https://github.com/loopingz/webda.io/commit/08b2db5d96cc4553d5ff2919cbf00287192b4ff6))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* operations system — decouple operations from transport ([#753](https://github.com/loopingz/webda.io/issues/753)) ([54f3151](https://github.com/loopingz/webda.io/commit/54f3151686b9115221790e90c3ee723fb0b8c873))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* dynamic import ([5f9daa9](https://github.com/loopingz/webda.io/commit/5f9daa99abe30d2f727319c7f562fc11144baf23))
* move to nodenext module and update Inject annotation ([d7d85e4](https://github.com/loopingz/webda.io/commit/d7d85e4dc2a73fce5e63429c02663d980515b667))
* move tsc-esm to TS5 decorators ([f626693](https://github.com/loopingz/webda.io/commit/f6266932742d87e7cc591ed9433eee22209977f6))
* symlink isMainModule ([7918dd1](https://github.com/loopingz/webda.io/commit/7918dd1704a3efff2afee7cf424d14d402b331e2))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))
* update repository to use StorableClass ([f79fc19](https://github.com/loopingz/webda.io/commit/f79fc198bf176ca5baa224ad1c3aab83b5cf9144))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/decorators bumped to 4.0.0-beta.3
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.3

## [4.0.0-beta.1](https://github.com/loopingz/webda.io/compare/tsc-esm-v1.3.0...tsc-esm-v4.0.0-beta.1) (2024-08-14)


### Miscellaneous Chores

* prepare version for 4.0 ([24e8e78](https://github.com/loopingz/webda.io/commit/24e8e789b8e4ac2364ac0d1669b115237ff4be6d))

## [1.3.0](https://github.com/loopingz/webda.io/compare/tsc-esm-v1.2.0...tsc-esm-v1.3.0) (2024-01-16)


### Features

* add service client event option ([cf68e7f](https://github.com/loopingz/webda.io/commit/cf68e7fa59ec26fc4e49ff593a6de4f53ea029c4))


### Bug Fixes

* sub node module catches ([2b74cb5](https://github.com/loopingz/webda.io/commit/2b74cb59110483bbb6d081df8fb8ca8cec124414))

## [1.2.0](https://github.com/loopingz/webda.io/compare/tsc-esm-v1.1.1...tsc-esm-v1.2.0) (2024-01-09)


### Features

* add subscription system ([b4f625c](https://github.com/loopingz/webda.io/commit/b4f625c44a306f57c7cc44b3aae805b1e6537c52))


### Bug Fixes

* import with comments ([2998903](https://github.com/loopingz/webda.io/commit/2998903a3a09910110041ee0d44c4526269226c6))

## [1.1.1](https://github.com/loopingz/webda.io/compare/tsc-esm-v1.1.0...tsc-esm-v1.1.1) (2023-11-30)


### Bug Fixes

* **tsc-esm:** node module import rewrite .js ([e4a15ae](https://github.com/loopingz/webda.io/commit/e4a15ae90a761620520cb890fa5a9121415c453b))

## [1.1.0](https://github.com/loopingz/webda.io/compare/tsc-esm-v1.0.6...tsc-esm-v1.1.0) (2023-11-12)


### Features

* drop node16 as it is EOL ([a6b795a](https://github.com/loopingz/webda.io/commit/a6b795a76e5089a0cf81269c49e00131bc17c1a9))

## [1.0.6](https://github.com/loopingz/webda.io/compare/tsc-esm-v1.0.5...tsc-esm-v1.0.6) (2023-08-30)


### Bug Fixes

* usage of single quote instead of double for import/export ([8c30f18](https://github.com/loopingz/webda.io/commit/8c30f183082084e82bfa34df1cc4f69e7c1d67ca))

## [1.0.5](https://github.com/loopingz/webda.io/compare/tsc-esm-v1.0.4...tsc-esm-v1.0.5) (2023-06-30)


### Bug Fixes

* add explicit dependencies declaration ([#411](https://github.com/loopingz/webda.io/issues/411)) ([4d8cbae](https://github.com/loopingz/webda.io/commit/4d8cbae4d6d31b62df98832591bc97ca77ae6a69))

## [1.0.4](https://github.com/loopingz/webda.io/compare/tsc-esm-v1.0.3...tsc-esm-v1.0.4) (2023-06-30)


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
