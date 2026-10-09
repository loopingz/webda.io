# Changelog

## [4.0.0-beta.6](https://github.com/loopingz/webda.io/compare/serialize-v4.0.0-beta.5...serialize-v4.0.0-beta.6) (2026-10-09)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.6

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/serialize-v4.0.0-beta.4...serialize-v4.0.0-beta.5) (2026-10-08)


### Bug Fixes

* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.5

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/serialize-v4.0.0-beta.3...serialize-v4.0.0-beta.4) (2026-10-08)


### ⚠ BREAKING CHANGES

* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800))

### Features

* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800)) ([74dc5df](https://github.com/loopingz/webda.io/commit/74dc5df103bdf93cdab92b02ef966598e44e2735))

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/serialize-v4.0.0-beta.1...serialize-v4.0.0-beta.3) (2026-10-05)


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

* add -0 serialization ([3596425](https://github.com/loopingz/webda.io/commit/35964255fb186556bb50f7363af7030a490a73d0))
* add auto-registration on serializer ([117c66e](https://github.com/loopingz/webda.io/commit/117c66efbc10b385a92144324bd6b6e92fb40ab4))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* add metadata plugins ([ffcd62c](https://github.com/loopingz/webda.io/commit/ffcd62caf2990e958682319166a684823609637e))
* allow custom object serializer ([6e17241](https://github.com/loopingz/webda.io/commit/6e17241f774b764b6cf677572ad2e3561b3b8d91))
* blog-system Binary/Binaries demo + e2e suite, with framework fixes ([#771](https://github.com/loopingz/webda.io/issues/771)) ([fe7e187](https://github.com/loopingz/webda.io/commit/fe7e18786744134fb29447a9f139689abbbd4950))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* hasSerializer to verify if a serializer is present ([8a8ad9c](https://github.com/loopingz/webda.io/commit/8a8ad9c3025a936293ebeadd9be7109648902100))
* model Behaviors v1 ([#765](https://github.com/loopingz/webda.io/issues/765)) ([5053245](https://github.com/loopingz/webda.io/commit/5053245440a60318f06fb9aecacf8113c31262a8))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* **serialize:** add new serialize module ([1458e9a](https://github.com/loopingz/webda.io/commit/1458e9a30e618a0fe433fa725b43ebf7c1d24431))


### Bug Fixes

* add simplified registerSerializer system ([7847854](https://github.com/loopingz/webda.io/commit/78478541994a2ae9c7117e09e2ebf63b61c38ba2))
* improve unit test ([2ec4141](https://github.com/loopingz/webda.io/commit/2ec41414470577e07e96b7ec18f314281f14475f))
* move to strict mode for @webda/serialize ([84f22b2](https://github.com/loopingz/webda.io/commit/84f22b25ecd48a902b2b4f3190923d8c5bf902ac))
* regexp deserialize ([bd2dc40](https://github.com/loopingz/webda.io/commit/bd2dc40107a10c181f047d23736c4bca2d137074))
* **serialize:** stop persisting OneToMany helpers ([04f3b27](https://github.com/loopingz/webda.io/commit/04f3b2733859c83822253ed036c9447c42008ae9))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))
* update Binary service ([282fcb1](https://github.com/loopingz/webda.io/commit/282fcb12d20428d1bca36b410ee78c6a6b6f2a80))
* update repository to use StorableClass ([f79fc19](https://github.com/loopingz/webda.io/commit/f79fc198bf176ca5baa224ad1c3aab83b5cf9144))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.3
