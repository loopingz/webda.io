# Changelog

## [4.0.0-beta.7](https://github.com/loopingz/webda.io/compare/utils-v4.0.0-beta.6...utils-v4.0.0-beta.7) (2026-10-10)


### Bug Fixes

* support Windows paths when loading and building modules ([#827](https://github.com/loopingz/webda.io/issues/827)) ([0d88747](https://github.com/loopingz/webda.io/commit/0d8874761196fcf09ac72bf9dc5bb31f8cfb87e1))

## [4.0.0-beta.6](https://github.com/loopingz/webda.io/compare/utils-v4.0.0-beta.5...utils-v4.0.0-beta.6) (2026-10-09)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.6

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/utils-v4.0.0-beta.4...utils-v4.0.0-beta.5) (2026-10-08)


### Bug Fixes

* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped to 4.0.0-beta.5
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.5

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/utils-v4.0.0-beta.3...utils-v4.0.0-beta.4) (2026-10-08)


### Features

* deployers as commands (deployment units, CloudFormation/Lambda, daemonless OCI images) ([#796](https://github.com/loopingz/webda.io/issues/796)) ([2539cc9](https://github.com/loopingz/webda.io/commit/2539cc991c29e65a76659a379d72ce7a51ebb1e7))

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/utils-v4.0.0-beta.1...utils-v4.0.0-beta.3) (2026-10-05)


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

* add a state machine utils ([16ff0ad](https://github.com/loopingz/webda.io/commit/16ff0adce591ed3b6f7d051318f64f06b7886ea6))
* add build hooks ([97016bc](https://github.com/loopingz/webda.io/commit/97016bcb9a7becfa87793fa6cc408784487e7e07))
* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add debounce and move freeze to dedicated file ([f754494](https://github.com/loopingz/webda.io/commit/f754494fba12e4e643c8f5b9d12e79a51ad98cd7))
* add error management in State ([aaa5e05](https://github.com/loopingz/webda.io/commit/aaa5e05806ad31d4b8e6e9d827de3b62a956da39))
* add filesize and duration helper classes ([b2dd2ad](https://github.com/loopingz/webda.io/commit/b2dd2adf338fd580a29481b0e913798227371f87))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* add jsonc/yaml edit with comments ([dd137bc](https://github.com/loopingz/webda.io/commit/dd137bc83904c635634acef77cd1a39420fc4669))
* add jsoncparser with proxy ([2dd634e](https://github.com/loopingz/webda.io/commit/2dd634e0ac99f802686ff1da990aef28c866dd3a))
* add runWithCurrentDirectory hook ([5808760](https://github.com/loopingz/webda.io/commit/5808760aac06a37022756e55ecfad2d3118b5aeb))
* add sub property for the tracking ([2c49903](https://github.com/loopingz/webda.io/commit/2c4990310948905d47744dea4de683aed914d665))
* add ts-plugin and the track method ([a061a24](https://github.com/loopingz/webda.io/commit/a061a24b5a5ecde5a09a1ce94ab694142fc38644))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* create @webda/utils module ([7e70111](https://github.com/loopingz/webda.io/commit/7e701118d94751bd70123db9d7892a71b521ec59))
* ensure operation schemas are exported ([301ad65](https://github.com/loopingz/webda.io/commit/301ad6540e490612450ea3b8096285b3063a830d))
* improve caching module ([08b2db5](https://github.com/loopingz/webda.io/commit/08b2db5d96cc4553d5ff2919cbf00287192b4ff6))
* loadConfigurationFile methods ([f883164](https://github.com/loopingz/webda.io/commit/f8831647da93a2503f4062d8998d3b37aef1960a))
* move Dirty mechanism from @webda/models to @webda/utils ([12d1f02](https://github.com/loopingz/webda.io/commit/12d1f02ea64d1a102ebf9df275bfa33b2a7dee2a))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* operations system — decouple operations from transport ([#753](https://github.com/loopingz/webda.io/issues/753)) ([54f3151](https://github.com/loopingz/webda.io/commit/54f3151686b9115221790e90c3ee723fb0b8c873))


### Bug Fixes

* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* getPath on DirtyState ([2dbc5d2](https://github.com/loopingz/webda.io/commit/2dbc5d2db8b4cf2d1ea64a5473beb0e7e3481939))
* serialize null value as it is valid json ([d9179dd](https://github.com/loopingz/webda.io/commit/d9179dd7fa452820270a7f5d174e55d9a6d522bc))
* state and method override ([90b7725](https://github.com/loopingz/webda.io/commit/90b7725bf62d95b456e1ab850ca08069efd4c40e))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))
* unit tests ([1d54f9b](https://github.com/loopingz/webda.io/commit/1d54f9b6d94d9c1cb91b8f114d0e728851e3493a))
* **utils:** settle CancelablePromise synchronously without touching this before super ([e91d2d2](https://github.com/loopingz/webda.io/commit/e91d2d2d714799387ac20fd80a2132275aab5627))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped to 4.0.0-beta.3
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.3
