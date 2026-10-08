# Changelog

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/models-v4.0.0-beta.4...models-v4.0.0-beta.5) (2026-10-08)


### ⚠ BREAKING CHANGES

* **core:** models defining canAct are now enforced on REST, gRPC and MCP operations; refused calls return 403. Query pages can be shorter than their LIMIT. OwnerModel ignores a client supplied _user. ResourceAcl.canAct signature changed to (context, action) and entries need a principal.

### Bug Fixes

* **core:** enforce model permissions on every transport, deny by default ([#810](https://github.com/loopingz/webda.io/issues/810)) ([24c1182](https://github.com/loopingz/webda.io/commit/24c11824f38999ef28ec7795c8af8d0ba862d9be))
* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/serialize bumped to 4.0.0-beta.5
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.5
    * @webda/test bumped to 4.0.0-beta.5
    * @webda/tsc-esm bumped to 4.0.0-beta.5
  * peerDependencies
    * @webda/ql bumped to 4.0.0-beta.5
    * @webda/utils bumped to 4.0.0-beta.5

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/models-v4.0.0-beta.3...models-v4.0.0-beta.4) (2026-10-08)


### ⚠ BREAKING CHANGES

* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800))

### Features

* add @webda/create (npm create [@webda](https://github.com/webda)) with agent guidance ([#799](https://github.com/loopingz/webda.io/issues/799)) ([e29822a](https://github.com/loopingz/webda.io/commit/e29822a82bca2c58043238001c5c817db91af817))
* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800)) ([74dc5df](https://github.com/loopingz/webda.io/commit/74dc5df103bdf93cdab92b02ef966598e44e2735))
* deployers as commands (deployment units, CloudFormation/Lambda, daemonless OCI images) ([#796](https://github.com/loopingz/webda.io/issues/796)) ([2539cc9](https://github.com/loopingz/webda.io/commit/2539cc991c29e65a76659a379d72ce7a51ebb1e7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/serialize bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
  * peerDependencies
    * @webda/utils bumped to 4.0.0-beta.4

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/models-v4.0.0-beta.1...models-v4.0.0-beta.3) (2026-10-05)


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

* add AbstractRepository and Store2Repository concept ([241595d](https://github.com/loopingz/webda.io/commit/241595d42e41590b582f7ee2ac6340f3b767750b))
* add dirty Mixin system ([acf39c5](https://github.com/loopingz/webda.io/commit/acf39c50a2375f922b6c9117ee17b5bd356e4fcd))
* add event repository ([c9106ec](https://github.com/loopingz/webda.io/commit/c9106ece6cd96a9a5f036a7c097c394569ec617f))
* add EventRepository ([52cc09c](https://github.com/loopingz/webda.io/commit/52cc09cd4ac4f456fe06baf7ebacdcaaaa0e0d83))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* add metadata plugins ([ffcd62c](https://github.com/loopingz/webda.io/commit/ffcd62caf2990e958682319166a684823609637e))
* add more types ([ab7a7c5](https://github.com/loopingz/webda.io/commit/ab7a7c5da3837fe620aa5befbb712d755baa480a))
* add new models module ([5ce4d89](https://github.com/loopingz/webda.io/commit/5ce4d89771f264439563b68be65602aa70cdf67a))
* add property paths modification ([6e23c2c](https://github.com/loopingz/webda.io/commit/6e23c2c8914cd9757aed53679a4cf3348b050e45))
* add Settable ([ca1e68a](https://github.com/loopingz/webda.io/commit/ca1e68a2e6a9295a235ca2def3947b6c85b6b10d))
* add WebdaQL as peer dependencies and implement query/iterate ([fbf3414](https://github.com/loopingz/webda.io/commit/fbf3414e94f6a01956d7abcf02e94ecb6f87c112))
* allow uid and pk on repository ([9f17f55](https://github.com/loopingz/webda.io/commit/9f17f5521d16b178dfc5aed144502ec929d7a700))
* blog-system Binary/Binaries demo + e2e suite, with framework fixes ([#771](https://github.com/loopingz/webda.io/issues/771)) ([fe7e187](https://github.com/loopingz/webda.io/commit/fe7e18786744134fb29447a9f139689abbbd4950))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* **compiler:** generate schemas with @webda/content-mapper ([af3b7c5](https://github.com/loopingz/webda.io/commit/af3b7c5daa3ba239210be2af490850cde3460d84))
* **content-mapper:** TypeScript 7.1 content mapper package ([9b57565](https://github.com/loopingz/webda.io/commit/9b57565a467d83671559fa4e2411124a5ae51109))
* dirty deep detector ([910faf6](https://github.com/loopingz/webda.io/commit/910faf625288abdc2db38719101b58baf8a9096f))
* ensure operation schemas are exported ([301ad65](https://github.com/loopingz/webda.io/commit/301ad6540e490612450ea3b8096285b3063a830d))
* ensure we use UID and reserve UUID for @webda/core ([da289ff](https://github.com/loopingz/webda.io/commit/da289ff94b775c14e7f5b32caf4213692871245a))
* improve caching module ([08b2db5](https://github.com/loopingz/webda.io/commit/08b2db5d96cc4553d5ff2919cbf00287192b4ff6))
* **mock:** add @webda/mock — coherent mock-data generation for models ([#761](https://github.com/loopingz/webda.io/issues/761)) ([c15a9b1](https://github.com/loopingz/webda.io/commit/c15a9b1b301ff42d99eac61affde6874dd78a0e4))
* model Behaviors v1 ([#765](https://github.com/loopingz/webda.io/issues/765)) ([5053245](https://github.com/loopingz/webda.io/commit/5053245440a60318f06fb9aecacf8113c31262a8))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* operation return values, HttpServer routing, and models fixes ([#754](https://github.com/loopingz/webda.io/issues/754)) ([0779301](https://github.com/loopingz/webda.io/commit/0779301fbcf066dcac1362396842b9aae65b6e59))
* **ql:** bind ? and :name query parameters ([#788](https://github.com/loopingz/webda.io/issues/788)) ([4a8647b](https://github.com/loopingz/webda.io/commit/4a8647bb9e8e7eedb1aeadf5e5bc77749437b440))
* Repository typed events, consumer migration + API positioning (PR 2+3 of 3) ([#777](https://github.com/loopingz/webda.io/issues/777)) ([70b0a75](https://github.com/loopingz/webda.io/commit/70b0a755fbeb430297cc161777a41acc2f8db14b))
* update OneToMany ([c0a2fb3](https://github.com/loopingz/webda.io/commit/c0a2fb3af27a969f81aa02eec80ba39358354f54))
* update watchers on service parameter on update ([f3417d7](https://github.com/loopingz/webda.io/commit/f3417d7004babaa6718012a68383bf19301a85fa))
* use symbols for relations ([8e3e0d0](https://github.com/loopingz/webda.io/commit/8e3e0d0ea6df92692b24e5134409e54b1bc55e50))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* add index.ts for @webda/models ([a2ed938](https://github.com/loopingz/webda.io/commit/a2ed938e67beb841fa2a7e1a95b85f9d901bb374))
* auto generated uuid ([25a7a28](https://github.com/loopingz/webda.io/commit/25a7a2849ae381e4e7538a1d5b14b5e9d3397ffe))
* back to 100% cov for models ([bae0122](https://github.com/loopingz/webda.io/commit/bae0122b6d151866b19f54dde8749e7c09146d22))
* clean up models ([96c27f0](https://github.com/loopingz/webda.io/commit/96c27f0207823c429d3f7e7bcc99bd71665b7917))
* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* **compiler:** make webdac code a working migration tool ([578ca7b](https://github.com/loopingz/webda.io/commit/578ca7b5243701a4ba1d9a9685c38b2f89ac27ed))
* **core:** make audit read operations opt-in and record the saved key on Create ([f1b25f5](https://github.com/loopingz/webda.io/commit/f1b25f571e58ddf514c2ff0b2b67cdd347e52ec0))
* enforce strict mode on @webda/models ([8a6f2c4](https://github.com/loopingz/webda.io/commit/8a6f2c40244c76829d0f277e05400a4b56792029))
* generate Stored schema ([1cd57eb](https://github.com/loopingz/webda.io/commit/1cd57eba922eb3559d02203fb51ecad52e0687d2))
* **models:** filter query results by class to stop subclass leakage ([#770](https://github.com/loopingz/webda.io/issues/770)) ([a58056d](https://github.com/loopingz/webda.io/commit/a58056dfcd970e276c79a152e00e31dc6f546dd7))
* **models:** use the generated primary key when creating without one ([bb1baf0](https://github.com/loopingz/webda.io/commit/bb1baf08f899c8082d68802aab622bb1f96f1e6d))
* move @webda/decorators to strict mode ([532da54](https://github.com/loopingz/webda.io/commit/532da54a2562b1663f404aa3fdf2bf010912b79f))
* post-migration follow-ups (store create uuid, LambdaServer stage, drop workarounds) ([#784](https://github.com/loopingz/webda.io/issues/784)) ([7eead4d](https://github.com/loopingz/webda.io/commit/7eead4d71152c19abaa834817b8bf4a7f89818d1))
* **serialize:** stop persisting OneToMany helpers ([04f3b27](https://github.com/loopingz/webda.io/commit/04f3b2733859c83822253ed036c9447c42008ae9))
* **stores:** escape WebdaQL string values and handle TRUE/FALSE in query translators ([d02f0a2](https://github.com/loopingz/webda.io/commit/d02f0a2307ba8f32ec5d16bb1e214f32aa68dd06))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))
* unit tests ([1d54f9b](https://github.com/loopingz/webda.io/commit/1d54f9b6d94d9c1cb91b8f114d0e728851e3493a))
* update Binary service ([282fcb1](https://github.com/loopingz/webda.io/commit/282fcb12d20428d1bca36b410ee78c6a6b6f2a80))
* update repository to use StorableClass ([f79fc19](https://github.com/loopingz/webda.io/commit/f79fc198bf176ca5baa224ad1c3aab83b5cf9144))
* use getPatch from DirtyState ([aae857e](https://github.com/loopingz/webda.io/commit/aae857e2c0572f38f1b48e0b2999f6001c3dc738))
* use symbols for webda configuration ([a89f640](https://github.com/loopingz/webda.io/commit/a89f64087248c8cae766dd24e92c7b7f176bef98))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.3
    * @webda/serialize bumped to 4.0.0-beta.3
    * @webda/test bumped to 4.0.0-beta.3
    * @webda/tsc-esm bumped to 4.0.0-beta.3
  * peerDependencies
    * @webda/ql bumped to 4.0.0-beta.3
    * @webda/utils bumped to 4.0.0-beta.3
