# Changelog

## [4.0.0-beta.12](https://github.com/loopingz/webda.io/compare/utils-v4.0.0-beta.11...utils-v4.0.0-beta.12) (2026-11-02)


### ⚠ BREAKING CHANGES

* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996))

### Features

* **azure:** add Azure services, Container Apps and Functions deployers ([#998](https://github.com/loopingz/webda.io/issues/998)) ([6c7b1aa](https://github.com/loopingz/webda.io/commit/6c7b1aa386b8930c125ce5c975e74ec0c21e686b))
* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996)) ([d9ddb34](https://github.com/loopingz/webda.io/commit/d9ddb34f2ec01bece5c4ca64631e14fe6d3d6264))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/decorators bumped to 4.0.0-beta.6
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.9

## [4.0.0-beta.11](https://github.com/loopingz/webda.io/compare/utils-v4.0.0-beta.10...utils-v4.0.0-beta.11) (2026-10-22)


### ⚠ BREAKING CHANGES

* Webda/Mailer moved to @webda/mailer
* **utils:** @webda/tsc-esm is no longer published. Import its types and helpers from @webda/utils, and createClassDecorator, createPropertyDecorator and createMethodDecorator from @webda/decorators.

### Features

* @webda/templates and @webda/mailer, keep only mailer contracts in core ([#58](https://github.com/loopingz/webda.io/issues/58)) ([#984](https://github.com/loopingz/webda.io/issues/984)) ([58e6ee6](https://github.com/loopingz/webda.io/commit/58e6ee6cddf42f58776d18a4c94fc2528846d6e2))


### Bug Fixes

* enable strict mode in utils and compiler ([#986](https://github.com/loopingz/webda.io/issues/986)) ([887e421](https://github.com/loopingz/webda.io/commit/887e421e273d70e5e22e41a920101d9a1f97eb0a))


### Code Refactoring

* **utils:** merge @webda/tsc-esm into @webda/utils and remove it ([#942](https://github.com/loopingz/webda.io/issues/942)) ([efcf87c](https://github.com/loopingz/webda.io/commit/efcf87c5adb1b697c4cf433545efb09a51459837))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped to 4.0.0-beta.6
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.8

## [4.0.0-beta.10](https://github.com/loopingz/webda.io/compare/utils-v4.0.0-beta.9...utils-v4.0.0-beta.10) (2026-10-15)


### Features

* **auth:** add model-scoped MFA with typed behavior configuration ([#888](https://github.com/loopingz/webda.io/issues/888)) ([ee068e8](https://github.com/loopingz/webda.io/commit/ee068e879ba3b49ccfcd103c3cbb9b72a9a9a9e5))
* **core:** URL-addressed getContent / putContent with Readable in and out ([#377](https://github.com/loopingz/webda.io/issues/377)) ([#904](https://github.com/loopingz/webda.io/issues/904)) ([2323103](https://github.com/loopingz/webda.io/commit/2323103b21e5c6b6d3dd31de0398302e9be4ea15))
* delegated OAuth 2.1 tokens with operation-level consent ([#928](https://github.com/loopingz/webda.io/issues/928)) ([44709d6](https://github.com/loopingz/webda.io/commit/44709d6adea6a7e346ada3bb7bd309ef3d9a54e0))


### Bug Fixes

* **utils:** parse decimal and exponent numbers in JSONCParser ([#915](https://github.com/loopingz/webda.io/issues/915)) ([f6487b0](https://github.com/loopingz/webda.io/commit/f6487b0c3c5e822e285ad7a97bbf3b9f91b8fb81))

## [4.0.0-beta.9](https://github.com/loopingz/webda.io/compare/utils-v4.0.0-beta.8...utils-v4.0.0-beta.9) (2026-10-14)


### Features

* **sdk:** typed frontend SDK over REST, GraphQL, gRPC and offline ([#850](https://github.com/loopingz/webda.io/issues/850)) ([#885](https://github.com/loopingz/webda.io/issues/885)) ([4d68a6a](https://github.com/loopingz/webda.io/commit/4d68a6ade4e5a12c3a836979dd04f5184b172b72))

## [4.0.0-beta.8](https://github.com/loopingz/webda.io/compare/utils-v4.0.0-beta.7...utils-v4.0.0-beta.8) (2026-10-12)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.7

## [4.0.0-beta.7](https://github.com/loopingz/webda.io/compare/utils-v4.0.0-beta.6...utils-v4.0.0-beta.7) (2026-10-11)


### Features

* **core:** config encrypt encrypts every secret field, --check fails on unencrypted secrets ([#854](https://github.com/loopingz/webda.io/issues/854)) ([8926a02](https://github.com/loopingz/webda.io/commit/8926a024a527b4f5271cfa2b1e8a4e4535167620))
* stable and documented configuration secret encryption ([#837](https://github.com/loopingz/webda.io/issues/837)) ([55fad94](https://github.com/loopingz/webda.io/commit/55fad94e96537c0b44ade1cdfb88e4b5e6c6035b))


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
