# Changelog

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/compiler-v4.0.0-beta.12...compiler-v4.0.0-beta.13) (2026-11-02)


### ⚠ BREAKING CHANGES

* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996))

### Features

* **compiler,models:** record delete policies on relations ([#982](https://github.com/loopingz/webda.io/issues/982)) ([7cd83af](https://github.com/loopingz/webda.io/commit/7cd83afd16fa5af6b6c5816bbb2f05257362bd89))
* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996)) ([d9ddb34](https://github.com/loopingz/webda.io/commit/d9ddb34f2ec01bece5c4ca64631e14fe6d3d6264))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **core:** validate symmetry of model relations and store routing ([#458](https://github.com/loopingz/webda.io/issues/458)) ([#905](https://github.com/loopingz/webda.io/issues/905)) ([3754359](https://github.com/loopingz/webda.io/commit/37543596ca25bbea2a2c1f83d0f438f047b884ec))
* **models:** add permission-aware polymorphic links ([#997](https://github.com/loopingz/webda.io/issues/997)) ([004562e](https://github.com/loopingz/webda.io/commit/004562e14b3bf47d61b29dcee5a430ae8082f4b5))
* **sealed:** offline decrypt-on-read, sealed-field query warning, escrow kid precondition, set size cap ([#1022](https://github.com/loopingz/webda.io/issues/1022)) ([5be9b53](https://github.com/loopingz/webda.io/commit/5be9b53aafacda210eda0163158273444d5c471a))


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))
* **sql:** relational store polish: review minors, @Index/@Unique, foreignKeysToJsonb, importFromJsonb ([#1023](https://github.com/loopingz/webda.io/issues/1023)) ([277555f](https://github.com/loopingz/webda.io/commit/277555fb450ef1e926cd4ace68be8cab72d116f3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/content-mapper bumped to 4.0.0-beta.11
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.9

## [4.0.0-beta.12](https://github.com/loopingz/webda.io/compare/compiler-v4.0.0-beta.11...compiler-v4.0.0-beta.12) (2026-10-22)


### ⚠ BREAKING CHANGES

* **core:** instance actions declaring non-context parameters now receive them instead of the operation context. Take the context with a context-typed parameter or useContext().
* **utils:** @webda/tsc-esm is no longer published. Import its types and helpers from @webda/utils, and createClassDecorator, createPropertyDecorator and createMethodDecorator from @webda/decorators.

### Features

* **auth:** track MFA verification time and enforce step-up freshness (maxMfaAge) ([#963](https://github.com/loopingz/webda.io/issues/963)) ([86cda56](https://github.com/loopingz/webda.io/commit/86cda56d06e3812c3e80a34d2b93488b2254a934))
* **compiler:** auto add $schema to deployment files ([#847](https://github.com/loopingz/webda.io/issues/847)) ([cd103be](https://github.com/loopingz/webda.io/commit/cd103bedc36acf4bd6c1dde894d9276bb76021cd))
* **core:** model actions receive their typed parameters ([#946](https://github.com/loopingz/webda.io/issues/946), phase 1) ([#955](https://github.com/loopingz/webda.io/issues/955)) ([7e8eebd](https://github.com/loopingz/webda.io/commit/7e8eebd47af7748936272c43869152bf1716b485))


### Bug Fixes

* **compiler:** rebuild when a dependency changes ([#959](https://github.com/loopingz/webda.io/issues/959)) ([d543fb2](https://github.com/loopingz/webda.io/commit/d543fb262cc4a9f52ccf80befda5e36eedda30fb))
* enable strict mode in utils and compiler ([#986](https://github.com/loopingz/webda.io/issues/986)) ([887e421](https://github.com/loopingz/webda.io/commit/887e421e273d70e5e22e41a920101d9a1f97eb0a))


### Code Refactoring

* **utils:** merge @webda/tsc-esm into @webda/utils and remove it ([#942](https://github.com/loopingz/webda.io/issues/942)) ([efcf87c](https://github.com/loopingz/webda.io/commit/efcf87c5adb1b697c4cf433545efb09a51459837))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/content-mapper bumped to 4.0.0-beta.10
    * @webda/utils bumped to 4.0.0-beta.11
    * @webda/workout bumped to 4.0.0-beta.6
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.8

## [4.0.0-beta.11](https://github.com/loopingz/webda.io/compare/compiler-v4.0.0-beta.10...compiler-v4.0.0-beta.11) (2026-10-16)


### Features

* **core:** apply webda.cli include/exclude to operation commands ([#931](https://github.com/loopingz/webda.io/issues/931)) ([7907541](https://github.com/loopingz/webda.io/commit/7907541c29b4c78c76ff1255a79974ca7e610d62))

## [4.0.0-beta.10](https://github.com/loopingz/webda.io/compare/compiler-v4.0.0-beta.9...compiler-v4.0.0-beta.10) (2026-10-15)


### Features

* **auth:** add model-scoped MFA with typed behavior configuration ([#888](https://github.com/loopingz/webda.io/issues/888)) ([ee068e8](https://github.com/loopingz/webda.io/commit/ee068e879ba3b49ccfcd103c3cbb9b72a9a9a9e5))
* **compiler:** auto add schema to config and deployment files ([#551](https://github.com/loopingz/webda.io/issues/551)) ([#906](https://github.com/loopingz/webda.io/issues/906)) ([4d96ba8](https://github.com/loopingz/webda.io/commit/4d96ba85bb443f4ab888a12df77579c26cdfb427))
* webda.cli in package.json — command selection, runCli and a generated app executable ([#927](https://github.com/loopingz/webda.io/issues/927)) ([10f68c6](https://github.com/loopingz/webda.io/commit/10f68c658f417cc102cab45f235ca82aa8d6d345))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/content-mapper bumped to 4.0.0-beta.9
    * @webda/utils bumped to 4.0.0-beta.10

## [4.0.0-beta.9](https://github.com/loopingz/webda.io/compare/compiler-v4.0.0-beta.8...compiler-v4.0.0-beta.9) (2026-10-14)


### ⚠ BREAKING CHANGES

* the unused store parameters modelAliases, defaultModel and forceModel are removed; use @WebdaAlias for renamed models. The runtime MigrationStore is removed: use webda migrate.

### Features

* **sdk:** typed frontend SDK over REST, GraphQL, gRPC and offline ([#850](https://github.com/loopingz/webda.io/issues/850)) ([#885](https://github.com/loopingz/webda.io/issues/885)) ([4d68a6a](https://github.com/loopingz/webda.io/commit/4d68a6ade4e5a12c3a836979dd04f5184b172b72))
* transparent Webda 3 → 4 data upgrade — legacy types, store migrations (core) ([#889](https://github.com/loopingz/webda.io/issues/889)) ([#890](https://github.com/loopingz/webda.io/issues/890)) ([01d4efb](https://github.com/loopingz/webda.io/commit/01d4efb22e676111318ee28fdc748575e0c85f33))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/content-mapper bumped to 4.0.0-beta.8
    * @webda/utils bumped to 4.0.0-beta.9

## [4.0.0-beta.8](https://github.com/loopingz/webda.io/compare/compiler-v4.0.0-beta.7...compiler-v4.0.0-beta.8) (2026-10-12)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/utils bumped to 4.0.0-beta.8
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.7

## [4.0.0-beta.7](https://github.com/loopingz/webda.io/compare/compiler-v4.0.0-beta.6...compiler-v4.0.0-beta.7) (2026-10-11)


### Features

* **core:** pki configuration encrypter and default encrypter ([#851](https://github.com/loopingz/webda.io/issues/851)) ([8777e06](https://github.com/loopingz/webda.io/commit/8777e063e1f4ef580cb21b447e63ff6e1d7e973c))


### Bug Fixes

* publish webda.module.json with debug, models, cloudevents and compiler ([#849](https://github.com/loopingz/webda.io/issues/849)) ([db9e967](https://github.com/loopingz/webda.io/commit/db9e967c2da4dc5d2e116a2a6d62c9cb46853fac))
* support Windows paths when loading and building modules ([#827](https://github.com/loopingz/webda.io/issues/827)) ([0d88747](https://github.com/loopingz/webda.io/commit/0d8874761196fcf09ac72bf9dc5bb31f8cfb87e1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/content-mapper bumped to 4.0.0-beta.7
    * @webda/utils bumped to 4.0.0-beta.7

## [4.0.0-beta.6](https://github.com/loopingz/webda.io/compare/compiler-v4.0.0-beta.5...compiler-v4.0.0-beta.6) (2026-10-09)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/content-mapper bumped to 4.0.0-beta.6
    * @webda/utils bumped to 4.0.0-beta.6
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.6

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/compiler-v4.0.0-beta.4...compiler-v4.0.0-beta.5) (2026-10-08)


### Bug Fixes

* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/content-mapper bumped to 4.0.0-beta.5
    * @webda/utils bumped to 4.0.0-beta.5
    * @webda/workout bumped to 4.0.0-beta.5
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.5

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/compiler-v4.0.0-beta.3...compiler-v4.0.0-beta.4) (2026-10-08)


### Features

* add @webda/create (npm create [@webda](https://github.com/webda)) with agent guidance ([#799](https://github.com/loopingz/webda.io/issues/799)) ([e29822a](https://github.com/loopingz/webda.io/commit/e29822a82bca2c58043238001c5c817db91af817))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/content-mapper bumped to 4.0.0-beta.4
    * @webda/utils bumped to 4.0.0-beta.4

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/compiler-v4.0.0-beta.2...compiler-v4.0.0-beta.3) (2026-10-05)


### ⚠ BREAKING CHANGES

* **compiler:** the accessors, loadParameters and unserializer modules are removed. They wrote into the sources what webdac build now generates through @webda/content-mapper, or methods nothing calls. The unused webdac build --code flag is removed too.
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
* **compiler:** model relations are now `type: "string"` in Input, Output and Stored schemas instead of an object with no properties, and six services gain the `type` property they inherit from ServiceParameters. Anything generated from these schemas — API validation, client types — changes with them.

### Features

* add Behavior and move Binary to Behavior ([ef05efb](https://github.com/loopingz/webda.io/commit/ef05efb3c7910d014336d3a3a0a102dfff38a1b6))
* add build hooks ([97016bc](https://github.com/loopingz/webda.io/commit/97016bcb9a7becfa87793fa6cc408784487e7e07))
* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add codemod to compiler ([7552a04](https://github.com/loopingz/webda.io/commit/7552a0430fd1784540799c2fffa76126b3ab57fb))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* add metadata plugins ([ffcd62c](https://github.com/loopingz/webda.io/commit/ffcd62caf2990e958682319166a684823609637e))
* add models schema generation ([921b0b4](https://github.com/loopingz/webda.io/commit/921b0b46661b7543591760d82bdd773c3081603b))
* add module @webda/compiler ([6d30cd3](https://github.com/loopingz/webda.io/commit/6d30cd38d79f7b8b0d2828b40586d75afc6e2e1b))
* add operation schema on models ([6c27107](https://github.com/loopingz/webda.io/commit/6c27107e07fc5c62c35aa0bd3ed3b2882196925b))
* allow Operation to be synchronous ([d010c1f](https://github.com/loopingz/webda.io/commit/d010c1f8ffc1751fc5dce3de4efd0b06a9c6626a))
* allow webda serve from @webda/core package ([69a6f01](https://github.com/loopingz/webda.io/commit/69a6f01cda754b68d3c8fb0694b47deaf8065159))
* blog-system Binary/Binaries demo + e2e suite, with framework fixes ([#771](https://github.com/loopingz/webda.io/issues/771)) ([fe7e187](https://github.com/loopingz/webda.io/commit/fe7e18786744134fb29447a9f139689abbbd4950))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* capability-based auto-injection for CLI commands ([#749](https://github.com/loopingz/webda.io/issues/749)) ([027f098](https://github.com/loopingz/webda.io/commit/027f098afb83796afab28d59cc04339f29bfad60))
* compiler morphers ([4ac0b9f](https://github.com/loopingz/webda.io/commit/4ac0b9f45ad0d7d649d434ce580c83a68623c16a))
* **compiler:** add PrimaryKeySeparator to ModelMetadata ([b62943b](https://github.com/loopingz/webda.io/commit/b62943b90b79367c66fb283c8f44049683ab1b9a))
* **compiler:** generate schemas with @webda/content-mapper ([af3b7c5](https://github.com/loopingz/webda.io/commit/af3b7c5daa3ba239210be2af490850cde3460d84))
* **compiler:** optional TypeScript 7 schema backend, off by default ([b58e72c](https://github.com/loopingz/webda.io/commit/b58e72c7f7dc96d21e0fa7368a8b29fddaf4dab3))
* **compiler:** require Webda classes to live in mapper-claimed files ([2dfac03](https://github.com/loopingz/webda.io/commit/2dfac03481bf5bd6242544886865f2a02b590471))
* enhance debug panels ([#759](https://github.com/loopingz/webda.io/issues/759)) ([63e6e0c](https://github.com/loopingz/webda.io/commit/63e6e0c3bd7d72fb06b148c7344eb3021d186ae9))
* improve caching module ([08b2db5](https://github.com/loopingz/webda.io/commit/08b2db5d96cc4553d5ff2919cbf00287192b4ff6))
* model Behaviors v1 ([#765](https://github.com/loopingz/webda.io/issues/765)) ([5053245](https://github.com/loopingz/webda.io/commit/5053245440a60318f06fb9aecacf8113c31262a8))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* move to the Fork util from @webda/workout ([a43b10b](https://github.com/loopingz/webda.io/commit/a43b10b3d23f5234e35ed27bfeab5e4cfc23d1dc))
* remove ts-json-schema dep ([2b7a67f](https://github.com/loopingz/webda.io/commit/2b7a67fb182f63ff254ff644e15d7d553c55c7b0))
* service capabilities and CLI commands system ([#743](https://github.com/loopingz/webda.io/issues/743)) ([ae2897c](https://github.com/loopingz/webda.io/commit/ae2897c85894bfa3f28c20f8341e13ee95b82cbc))
* update @webda/test to use new annotations ([15e8b30](https://github.com/loopingz/webda.io/commit/15e8b30506043fb9cfe6ac544c0093496a07d6fc))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* add cli in core ([814a599](https://github.com/loopingz/webda.io/commit/814a599ee263fa85e2b8c38a2c6cd5563a1fa995))
* add schema generation on build ([e63880c](https://github.com/loopingz/webda.io/commit/e63880c0e0f275bdf37e022f28e3430c4498cea2))
* add service operation detection ([62e3a05](https://github.com/loopingz/webda.io/commit/62e3a05595367089e447a530a8ce146aeeab30d9))
* allow comments in tsconfig.json ([1b75cde](https://github.com/loopingz/webda.io/commit/1b75cdecb8af91ec2df9cbe279b3ce5a07fc9843))
* compiler configuration import guess ([72deeba](https://github.com/loopingz/webda.io/commit/72deeba7bbd3af99bfb2ead1053a54259f3a6213))
* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* **compiler:** make webdac code a working migration tool ([578ca7b](https://github.com/loopingz/webda.io/commit/578ca7b5243701a4ba1d9a9685c38b2f89ac27ed))
* **compiler:** rebuild the module when the generated service map changes ([c52dec3](https://github.com/loopingz/webda.io/commit/c52dec3ead3ebce6df934e1c5a84766103368e56))
* **compiler:** rebuild when any emitted file is missing ([ca99edd](https://github.com/loopingz/webda.io/commit/ca99edd9ea8cd05157914bd7ad651e948ccf0ef9))
* importing ModelLink ([808ab14](https://github.com/loopingz/webda.io/commit/808ab148d90ce81279cb50c18d2aa3aa48dc555c))
* interactive logger ([8c30ee9](https://github.com/loopingz/webda.io/commit/8c30ee9f9dd5c40fba149fa0cadba54e1239db81))
* metadata guess on compile ([5e6dcec](https://github.com/loopingz/webda.io/commit/5e6dcec9cd27546b0cf0bace1e8d470afa887661))
* move to nodenext module and update Inject annotation ([d7d85e4](https://github.com/loopingz/webda.io/commit/d7d85e4dc2a73fce5e63429c02663d980515b667))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/utils bumped to 4.0.0-beta.3
    * @webda/workout bumped to 4.0.0-beta.3
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.3
