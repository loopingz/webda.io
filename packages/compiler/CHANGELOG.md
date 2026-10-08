# Changelog

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
