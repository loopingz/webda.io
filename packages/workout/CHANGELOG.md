# Changelog

### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/tsc-esm bumped from ^1.0.5 to ^1.0.6

### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/tsc-esm bumped from ^1.1.0 to ^1.1.1

### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/tsc-esm bumped from ^1.1.1 to ^1.2.0

### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/tsc-esm bumped from ^1.2.0 to ^1.3.0

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/workout-v4.0.0-beta.3...workout-v4.0.0-beta.5) (2026-10-08)


### Bug Fixes

* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/workout-v4.0.0-beta.1...workout-v4.0.0-beta.3) (2026-10-05)


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

* add a non-interactive fallback for InteractiveConsoleLogger ([908956b](https://github.com/loopingz/webda.io/commit/908956b1be673a6095f8de3d070b2353e2a74664))
* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* add logger context ([316189b](https://github.com/loopingz/webda.io/commit/316189b2e661d6c6b0c090e541570110652596dd))
* add simpler interactive console ([0e89d48](https://github.com/loopingz/webda.io/commit/0e89d48be66d611f68fe3baf897d8bc7e25bedee))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* improve workout ([dd9a4a9](https://github.com/loopingz/webda.io/commit/dd9a4a952d524a73079dd0df9fb66ac1b28695d7))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* move to the Fork util from @webda/workout ([a43b10b](https://github.com/loopingz/webda.io/commit/a43b10b3d23f5234e35ed27bfeab5e4cfc23d1dc))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))
* router auto-instantiation, request routing, and --watch mode ([#747](https://github.com/loopingz/webda.io/issues/747)) ([5cc4a19](https://github.com/loopingz/webda.io/commit/5cc4a1913355a856362e6c58755f37e4d2d5229c))
* **workout,core:** keep piped CLI output clean ([e92bd22](https://github.com/loopingz/webda.io/commit/e92bd2251c52da0c8c3fb7bd670b074ff5a8ec95))


### Bug Fixes

* flush forkee messages before exiting ([09d7255](https://github.com/loopingz/webda.io/commit/09d7255009343eed1aa540ddd4f8d9536940be7b))
* interactive logger ([8c30ee9](https://github.com/loopingz/webda.io/commit/8c30ee9f9dd5c40fba149fa0cadba54e1239db81))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))

## [4.0.0-beta.1](https://github.com/loopingz/webda.io/compare/workout-v3.2.0...workout-v4.0.0-beta.1) (2024-08-14)


### Miscellaneous Chores

* prepare version for 4.0 ([24e8e78](https://github.com/loopingz/webda.io/commit/24e8e789b8e4ac2364ac0d1669b115237ff4be6d))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/tsc-esm bumped from ^1.3.0 to ^4.0.0-beta.1

## [3.2.0](https://github.com/loopingz/webda.io/compare/workout-v3.1.3...workout-v3.2.0) (2024-04-12)


### Features

* update to latest otel ([db00927](https://github.com/loopingz/webda.io/commit/db00927fa3bc442b21aac2a970b0da33b6c845b6))

## [3.1.0](https://github.com/loopingz/webda.io/compare/workout-v3.0.4...workout-v3.1.0) (2023-11-12)


### Features

* add CoreModel listeners system ([977dd9d](https://github.com/loopingz/webda.io/commit/977dd9d8a04f5b3e6d19f09f8755277b26242a18))
* drop node16 as it is EOL ([a6b795a](https://github.com/loopingz/webda.io/commit/a6b795a76e5089a0cf81269c49e00131bc17c1a9))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/tsc-esm bumped from ^1.0.6 to ^1.1.0

## [3.0.4](https://github.com/loopingz/webda.io/compare/workout-v3.0.3...workout-v3.0.4) (2023-10-04)


### Bug Fixes

* default toLowerCase for k8s resources name ([aaa0d58](https://github.com/loopingz/webda.io/commit/aaa0d5844f12532d2eb3a5813968a730deb4d4d0))

## [3.0.2](https://github.com/loopingz/webda.io/compare/workout-v3.0.1...workout-v3.0.2) (2023-06-30)


### Bug Fixes

* add explicit dependencies declaration ([#411](https://github.com/loopingz/webda.io/issues/411)) ([4d8cbae](https://github.com/loopingz/webda.io/commit/4d8cbae4d6d31b62df98832591bc97ca77ae6a69))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/tsc-esm bumped from ^1.0.4 to ^1.0.5

## [3.0.1](https://github.com/loopingz/webda.io/compare/workout-v3.0.0...workout-v3.0.1) (2023-06-30)


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/tsc-esm bumped from ^1.0.3 to ^1.0.4
