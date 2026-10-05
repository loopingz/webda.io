:robot: I have created a release *beep* *boop*
---


<details><summary>amqp: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/amqp-v4.0.0-beta.3...amqp-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/utils bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>async: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/async-v4.0.0-beta.3...async-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/ql bumped to 4.0.0-beta.1
    * @webda/utils bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>aws: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/aws-v4.0.0-beta.3...aws-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/async bumped to 4.0.0-beta.4
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/ql bumped to 4.0.0-beta.1
    * @webda/utils bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>cache: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/cache-v4.0.0-beta.3...cache-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>cloudevents: 4.0.0-beta.1</summary>

## [4.0.0-beta.1](https://github.com/loopingz/webda.io/compare/cloudevents-v4.0.0-beta.3...cloudevents-v4.0.0-beta.1) (2026-10-05)


###   BREAKING CHANGES

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
* **cloudevents:** add index exporter ([2794fb1](https://github.com/loopingz/webda.io/commit/2794fb10a86bd911a8db532a596c1d0394c68202))
* **cloudevents:** add isCloudEvent() duck-typing validation ([#746](https://github.com/loopingz/webda.io/issues/746)) ([afcdf66](https://github.com/loopingz/webda.io/commit/afcdf668f50f6ea85e331453bea966d81912badb))
* **cloudevents:** add module ([562f4a9](https://github.com/loopingz/webda.io/commit/562f4a929e6cb3931a07d9db23d3e1b596272d16))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))


### Bug Fixes

* codeql warn ([9aa445f](https://github.com/loopingz/webda.io/commit/9aa445fa052dc434df6d8eb04bc1bb2d484f1f2d))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Miscellaneous Chores

* prepare version for 4.0 ([24e8e78](https://github.com/loopingz/webda.io/commit/24e8e789b8e4ac2364ac0d1669b115237ff4be6d))


### Continuous Integration

* update additional modules ([77b32e9](https://github.com/loopingz/webda.io/commit/77b32e9dbd950ddaebe11cda22c20d71ab7f309a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
</details>

<details><summary>compiler: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/compiler-v4.0.0-beta.3...compiler-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/utils bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>core: 4.0.0-beta.1</summary>

## [4.0.0-beta.1](https://github.com/loopingz/webda.io/compare/core-v4.0.0-beta.3...core-v4.0.0-beta.1) (2026-10-05)


###   BREAKING CHANGES

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
* the `@webda/schema` package is removed, along with its `webda-schema-generator` CLI. Schema generation lives in `@webda/content-mapper` and is driven by `@webda/compiler`; nothing in the repo imported `@webda/schema` any more after the previous commit.
* **compiler:** model relations are now `type: "string"` in Input, Output and Stored schemas instead of an object with no properties, and six services gain the `type` property they inherit from ServiceParameters. Anything generated from these schemas  API validation, client types  changes with them.
* use AsyncLocalStorage for Context
* remove node 18 support
* remove expose for Store
* update StorageFinder to use promises to allow GCS/S3

### Features

* add @webda/debug package  introspection API + WebSocket live events ([#750](https://github.com/loopingz/webda.io/issues/750)) ([307b2f2](https://github.com/loopingz/webda.io/commit/307b2f2267f2eacd1be8ec4a44f47999e0c61931))
* add AbstractRepository and Store2Repository concept ([241595d](https://github.com/loopingz/webda.io/commit/241595d42e41590b582f7ee2ac6340f3b767750b))
* add Behavior and move Binary to Behavior ([ef05efb](https://github.com/loopingz/webda.io/commit/ef05efb3c7910d014336d3a3a0a102dfff38a1b6))
* add build hooks ([97016bc](https://github.com/loopingz/webda.io/commit/97016bcb9a7becfa87793fa6cc408784487e7e07))
* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* add grpc module and sample-app webui ([#756](https://github.com/loopingz/webda.io/issues/756)) ([4a7df9a](https://github.com/loopingz/webda.io/commit/4a7df9aacff8ca5e16c57e5fa9f2e2f0dc786e2f))
* add iterate method definition ([88e0b98](https://github.com/loopingz/webda.io/commit/88e0b982c77eca2ab567da2bc1779da94755f87c))
* add metadata plugins ([ffcd62c](https://github.com/loopingz/webda.io/commit/ffcd62caf2990e958682319166a684823609637e))
* add openapi CLI command to export OpenAPI definition ([#748](https://github.com/loopingz/webda.io/issues/748)) ([a3a09bf](https://github.com/loopingz/webda.io/commit/a3a09bffd850cf7286354385c5f9c975a4cb5712))
* add rest domain service ([bfc72e6](https://github.com/loopingz/webda.io/commit/bfc72e64728c3f1e1348322156f1b04835d6db37))
* allow webda serve from @webda/core package ([69a6f01](https://github.com/loopingz/webda.io/commit/69a6f01cda754b68d3c8fb0694b47deaf8065159))
* blog-system Binary/Binaries demo + e2e suite, with framework fixes ([#771](https://github.com/loopingz/webda.io/issues/771)) ([fe7e187](https://github.com/loopingz/webda.io/commit/fe7e18786744134fb29447a9f139689abbbd4950))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* capability-based auto-injection for CLI commands ([#749](https://github.com/loopingz/webda.io/issues/749)) ([027f098](https://github.com/loopingz/webda.io/commit/027f098afb83796afab28d59cc04339f29bfad60))
* **cloudevents:** add module ([562f4a9](https://github.com/loopingz/webda.io/commit/562f4a929e6cb3931a07d9db23d3e1b596272d16))
* **compiler:** generate schemas with @webda/content-mapper ([af3b7c5](https://github.com/loopingz/webda.io/commit/af3b7c5daa3ba239210be2af490850cde3460d84))
* **content-mapper:** TypeScript 7.1 content mapper package ([9b57565](https://github.com/loopingz/webda.io/commit/9b57565a467d83671559fa4e2411124a5ae51109))
* **core:** add MCP operation hints, canCallOperation and the operationStreaming flag ([aebe2cc](https://github.com/loopingz/webda.io/commit/aebe2ccfcc875a49e51bdfc2d21459d2ffe0265b))
* **core:** carry the operation subject in operation events ([5f960f7](https://github.com/loopingz/webda.io/commit/5f960f79b32cd492a649f99fc9dca5b62952af76))
* **core:** flat models[] config + internal field migration (PR 1 of 3) ([#776](https://github.com/loopingz/webda.io/issues/776)) ([56d4b01](https://github.com/loopingz/webda.io/commit/56d4b01524be424508b80e2f1ed4f388174d73ad))
* **core:** let operations declare their subject with setOperationSubject ([07c3bdf](https://github.com/loopingz/webda.io/commit/07c3bdfae5b7f38abdf9e251354adf24a3fdf42c))
* **core:** read the audit log per subject, per actor or globally ([74783ae](https://github.com/loopingz/webda.io/commit/74783aebbc4d7e9f9908eeb283db45348e5e3069))
* **core:** record the operation subject on audit entries ([feb62c8](https://github.com/loopingz/webda.io/commit/feb62c87892d78978aa541f28ae4725edaddb112))
* **debug:** capture request/response details + 4xx error UX fixes ([#769](https://github.com/loopingz/webda.io/issues/769)) ([9709f47](https://github.com/loopingz/webda.io/commit/9709f47defe62b38788454734c88210641f5506a))
* default REST routes for operations, bean service fixes ([#755](https://github.com/loopingz/webda.io/issues/755)) ([ccebecf](https://github.com/loopingz/webda.io/commit/ccebecfe37fe5417f36a689fe4973901e450c82a))
* enhance debug panels ([#759](https://github.com/loopingz/webda.io/issues/759)) ([63e6e0c](https://github.com/loopingz/webda.io/commit/63e6e0c3bd7d72fb06b148c7344eb3021d186ae9))
* improve caching module ([08b2db5](https://github.com/loopingz/webda.io/commit/08b2db5d96cc4553d5ff2919cbf00287192b4ff6))
* model Behaviors v1 ([#765](https://github.com/loopingz/webda.io/issues/765)) ([5053245](https://github.com/loopingz/webda.io/commit/5053245440a60318f06fb9aecacf8113c31262a8))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* move to ServiceName ([a545a03](https://github.com/loopingz/webda.io/commit/a545a03f166b3f27088ef2d8e3fc40c56f5813b8))
* operation return values, HttpServer routing, and models fixes ([#754](https://github.com/loopingz/webda.io/issues/754)) ([0779301](https://github.com/loopingz/webda.io/commit/0779301fbcf066dcac1362396842b9aae65b6e59))
* operations system  decouple operations from transport ([#753](https://github.com/loopingz/webda.io/issues/753)) ([54f3151](https://github.com/loopingz/webda.io/commit/54f3151686b9115221790e90c3ee723fb0b8c873))
* **postgres:** pubsub + queue services and migrate Store to current core API ([#774](https://github.com/loopingz/webda.io/issues/774)) ([408e229](https://github.com/loopingz/webda.io/commit/408e22983861607dd1d3ef6918cd53e8e27915d1))
* remove expose for Store ([c8a36b1](https://github.com/loopingz/webda.io/commit/c8a36b19c81b830e9c03195388b402e53f987e6e))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))
* Repository typed events, consumer migration + API positioning (PR 2+3 of 3) ([#777](https://github.com/loopingz/webda.io/issues/777)) ([70b0a75](https://github.com/loopingz/webda.io/commit/70b0a755fbeb430297cc161777a41acc2f8db14b))
* **rest:** add 201 - Created http code for creation ([#680](https://github.com/loopingz/webda.io/issues/680)) ([5db4dda](https://github.com/loopingz/webda.io/commit/5db4ddab838a25dc49bddd1705357187e2049a6c))
* router auto-instantiation, request routing, and --watch mode ([#747](https://github.com/loopingz/webda.io/issues/747)) ([5cc4a19](https://github.com/loopingz/webda.io/commit/5cc4a1913355a856362e6c58755f37e4d2d5229c))
* separate WebdaQL module ([69beabb](https://github.com/loopingz/webda.io/commit/69beabb0d1715ab81636338509539ade89c07c6a))
* service capabilities and CLI commands system ([#743](https://github.com/loopingz/webda.io/issues/743)) ([ae2897c](https://github.com/loopingz/webda.io/commit/ae2897c85894bfa3f28c20f8341e13ee95b82cbc))
* test allow dynamic configuration in TestApplication ([3af8187](https://github.com/loopingz/webda.io/commit/3af8187ba6179e19c9db261f81075a86d09e0cc9))
* update StorageFinder to use promises to allow GCS/S3 ([6f36aec](https://github.com/loopingz/webda.io/commit/6f36aecffbdd080a92840be5e3a949c91e3281c8))
* update store to model ([#577](https://github.com/loopingz/webda.io/issues/577)) ([018d096](https://github.com/loopingz/webda.io/commit/018d0969ce83b9a1e8346a9ef5df9857573adb3e))
* update watchers on service parameter on update ([f3417d7](https://github.com/loopingz/webda.io/commit/f3417d7004babaa6718012a68383bf19301a85fa))
* use AsyncLocalStorage for Context ([0df77c8](https://github.com/loopingz/webda.io/commit/0df77c86e366afedd92da51fea52d2f122cd69b8))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))
* **workout,core:** keep piped CLI output clean ([e92bd22](https://github.com/loopingz/webda.io/commit/e92bd2251c52da0c8c3fb7bd670b074ff5a8ec95))


### Bug Fixes

* add cache-control headers by default ([70c040e](https://github.com/loopingz/webda.io/commit/70c040ed663f3ddd4a7f360d0b26991d4415f2f1))
* add cli in core ([814a599](https://github.com/loopingz/webda.io/commit/814a599ee263fa85e2b8c38a2c6cd5563a1fa995))
* add index.ts for @webda/models ([a2ed938](https://github.com/loopingz/webda.io/commit/a2ed938e67beb841fa2a7e1a95b85f9d901bb374))
* add missing types for Mailer service ([bcdb6fc](https://github.com/loopingz/webda.io/commit/bcdb6fc93a56c69e14cfd4d432e68d70cb503cdf))
* auto generated uuid ([25a7a28](https://github.com/loopingz/webda.io/commit/25a7a2849ae381e4e7538a1d5b14b5e9d3397ffe))
* buffer types ([1d4fb31](https://github.com/loopingz/webda.io/commit/1d4fb318ff491713cda15f3bf7d302602d16b5d9))
* clean cancel on SIGINT ([90c8627](https://github.com/loopingz/webda.io/commit/90c862701bc2e17ff2f513c0a0e98af5aa8fc883))
* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* **compiler:** make webdac code a working migration tool ([578ca7b](https://github.com/loopingz/webda.io/commit/578ca7b5243701a4ba1d9a9685c38b2f89ac27ed))
* **core:** answer unmatched routes with a 404 error body; blog root opens the admin UI ([dfbb75a](https://github.com/loopingz/webda.io/commit/dfbb75a95c4d6b1f49c6672f3bb35d5b77405173))
* **core:** call super() first and unconditionally in Binary ([65c7da0](https://github.com/loopingz/webda.io/commit/65c7da05fbfd727ad6694d973f3d60eb6c88e895))
* **core:** don't JSON-parse multipart request bodies ([6d5f61f](https://github.com/loopingz/webda.io/commit/6d5f61fd4cd6cc4546c6adb55256c5498aeda2f0))
* **core:** filequeue node 22 lock ([266eb8a](https://github.com/loopingz/webda.io/commit/266eb8a197f660f16026f69591e19e2a5b2a0856))
* **core:** make audit read operations opt-in and record the saved key on Create ([f1b25f5](https://github.com/loopingz/webda.io/commit/f1b25f571e58ddf514c2ff0b2b67cdd347e52ec0))
* **core:** per-application DomainService schemas and AuditService unsubscribe ([ddddfcb](https://github.com/loopingz/webda.io/commit/ddddfcbf9186447d969b3b3ac9bdccbcca2f863f))
* **core:** plurals with s ending name ([b643003](https://github.com/loopingz/webda.io/commit/b64300360bbe07adf65203997ce86d6bc38279cf))
* **core:** redirect plain HTTP to https on a TLS port ([17f6262](https://github.com/loopingz/webda.io/commit/17f62620fd166c612a4b3cdb6101fc3811cfa82a))
* **core:** resolve type error in setModelMetadata for Ancestors/Subclasses ([152d044](https://github.com/loopingz/webda.io/commit/152d0441a6bde2cbc4c6ef29b19c58a8a03bc54c))
* **core:** route on the uri relative to the HttpContext prefix ([7da5ab9](https://github.com/loopingz/webda.io/commit/7da5ab9b474940fd983aaea5c422490d476bbb7f))
* **core:** serve ResourceService folders under their trailing slash ([53b3dc3](https://github.com/loopingz/webda.io/commit/53b3dc38b6f8145b5e30cfcae2809c31c3621f2d))
* **core:** stop subclasses inheriting a registered modda's configuration factories ([31780a0](https://github.com/loopingz/webda.io/commit/31780a069aa887e9c77c6674d072c48a5e9fce03))
* enforce strict mode on @webda/models ([8a6f2c4](https://github.com/loopingz/webda.io/commit/8a6f2c40244c76829d0f277e05400a4b56792029))
* interactive logger ([8c30ee9](https://github.com/loopingz/webda.io/commit/8c30ee9f9dd5c40fba149fa0cadba54e1239db81))
* MemoryQueue wait if no message available ([57d4bd8](https://github.com/loopingz/webda.io/commit/57d4bd834a8dcaa6f33f052c5e315079a58ffcce))
* move to nodenext module and update Inject annotation ([d7d85e4](https://github.com/loopingz/webda.io/commit/d7d85e4dc2a73fce5e63429c02663d980515b667))
* non passing application ([7cd75e5](https://github.com/loopingz/webda.io/commit/7cd75e5a95824a4eab1f3ac73e5fe0f56778b0e3))
* numeric equals on postgres ([75f5e36](https://github.com/loopingz/webda.io/commit/75f5e36e1517a29f99c99e7e4af0e4d5da9ba8bd))
* post-migration follow-ups (store create uuid, LambdaServer stage, drop workarounds) ([#784](https://github.com/loopingz/webda.io/issues/784)) ([7eead4d](https://github.com/loopingz/webda.io/commit/7eead4d71152c19abaa834817b8bf4a7f89818d1))
* prometheus missing export and additional close ([1e17465](https://github.com/loopingz/webda.io/commit/1e17465928bc9edffc7ad824de5a63d779f6a2a0))
* pubsub queue abusive close ([33ccadc](https://github.com/loopingz/webda.io/commit/33ccadcd630e6de84b00745cb48012231f3d69bd))
* registerInteruptableProcess before Core.get() exists ([0b9cbcb](https://github.com/loopingz/webda.io/commit/0b9cbcb87ab03316ad78c3ef3be89baaae4d92f7))
* **ResourceService:** ensure we do not serve . files ([#678](https://github.com/loopingz/webda.io/issues/678)) ([8abbcda](https://github.com/loopingz/webda.io/commit/8abbcdae988f0ca3d6ecc1f70b4c6dee7f17002a))
* **rest,debug:** give model PATCH its own OpenAPI operation and URL ([f3161b1](https://github.com/loopingz/webda.io/commit/f3161b1fc562e03408f7f93658fab99c9c3ec53f))
* **rest:** give model action routes their operationId ([87fd523](https://github.com/loopingz/webda.io/commit/87fd523a14dbaec4f9dba896f7007e85f789ffe3))
* **rest:** match routes without a query template on the path alone ([0f8c689](https://github.com/loopingz/webda.io/commit/0f8c6890987a1f1a22384f0b4d87be41eff291bd))
* state and method override ([90b7725](https://github.com/loopingz/webda.io/commit/90b7725bf62d95b456e1ab850ca08069efd4c40e))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))
* update Binary service ([282fcb1](https://github.com/loopingz/webda.io/commit/282fcb12d20428d1bca36b410ee78c6a6b6f2a80))
* update in otel and json-schema-generator ([c1d9866](https://github.com/loopingz/webda.io/commit/c1d9866ffc6717b622c4e4d72682ef91dc187a12))
* update repository to use StorableClass ([f79fc19](https://github.com/loopingz/webda.io/commit/f79fc198bf176ca5baa224ad1c3aab83b5cf9144))
* WebdaQL prepend with limit and offset ([55cb37a](https://github.com/loopingz/webda.io/commit/55cb37a233fa582c24a53171ce9a035480defe8e))


### Miscellaneous Chores

* delete @webda/schema ([1fbd1a4](https://github.com/loopingz/webda.io/commit/1fbd1a4343cb24be639e35c776129e8fec78e379))
* prepare version for 4.0 ([24e8e78](https://github.com/loopingz/webda.io/commit/24e8e789b8e4ac2364ac0d1669b115237ff4be6d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/cache bumped to 4.0.0-beta.4
    * @webda/models bumped to 4.0.0-beta.4
    * @webda/ql bumped to 4.0.0-beta.1
    * @webda/utils bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
    * @webda/tsc-esm bumped to 4.0.0-beta.1
</details>

<details><summary>debug: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/debug-v4.0.0-beta.3...debug-v4.0.0-beta.4) (2026-10-05)


###   BREAKING CHANGES

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
* **compiler:** model relations are now `type: "string"` in Input, Output and Stored schemas instead of an object with no properties, and six services gain the `type` property they inherit from ServiceParameters. Anything generated from these schemas  API validation, client types  changes with them.

### Features

* add @webda/debug package  introspection API + WebSocket live events ([#750](https://github.com/loopingz/webda.io/issues/750)) ([307b2f2](https://github.com/loopingz/webda.io/commit/307b2f2267f2eacd1be8ec4a44f47999e0c61931))
* add Behavior and move Binary to Behavior ([ef05efb](https://github.com/loopingz/webda.io/commit/ef05efb3c7910d014336d3a3a0a102dfff38a1b6))
* blog-system Binary/Binaries demo + e2e suite, with framework fixes ([#771](https://github.com/loopingz/webda.io/issues/771)) ([fe7e187](https://github.com/loopingz/webda.io/commit/fe7e18786744134fb29447a9f139689abbbd4950))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* **compiler:** generate schemas with @webda/content-mapper ([af3b7c5](https://github.com/loopingz/webda.io/commit/af3b7c5daa3ba239210be2af490850cde3460d84))
* **content-mapper:** TypeScript 7.1 content mapper package ([9b57565](https://github.com/loopingz/webda.io/commit/9b57565a467d83671559fa4e2411124a5ae51109))
* **debug:** capture request/response details + 4xx error UX fixes ([#769](https://github.com/loopingz/webda.io/issues/769)) ([9709f47](https://github.com/loopingz/webda.io/commit/9709f47defe62b38788454734c88210641f5506a))
* default REST routes for operations, bean service fixes ([#755](https://github.com/loopingz/webda.io/issues/755)) ([ccebecf](https://github.com/loopingz/webda.io/commit/ccebecfe37fe5417f36a689fe4973901e450c82a))
* enhance debug panels ([#759](https://github.com/loopingz/webda.io/issues/759)) ([63e6e0c](https://github.com/loopingz/webda.io/commit/63e6e0c3bd7d72fb06b148c7344eb3021d186ae9))
* operation return values, HttpServer routing, and models fixes ([#754](https://github.com/loopingz/webda.io/issues/754)) ([0779301](https://github.com/loopingz/webda.io/commit/0779301fbcf066dcac1362396842b9aae65b6e59))
* operations system  decouple operations from transport ([#753](https://github.com/loopingz/webda.io/issues/753)) ([54f3151](https://github.com/loopingz/webda.io/commit/54f3151686b9115221790e90c3ee723fb0b8c873))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* **compiler:** make webdac code a working migration tool ([578ca7b](https://github.com/loopingz/webda.io/commit/578ca7b5243701a4ba1d9a9685c38b2f89ac27ed))
* **rest,debug:** give model PATCH its own OpenAPI operation and URL ([f3161b1](https://github.com/loopingz/webda.io/commit/f3161b1fc562e03408f7f93658fab99c9c3ec53f))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/utils bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>elasticsearch: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/elasticsearch-v4.0.0-beta.3...elasticsearch-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.1
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>fs: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/fs-v4.0.0-beta.3...fs-v4.0.0-beta.4) (2026-10-05)


###   BREAKING CHANGES

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
* **compiler:** model relations are now `type: "string"` in Input, Output and Stored schemas instead of an object with no properties, and six services gain the `type` property they inherit from ServiceParameters. Anything generated from these schemas  API validation, client types  changes with them.

### Features

* blog-system Binary/Binaries demo + e2e suite, with framework fixes ([#771](https://github.com/loopingz/webda.io/issues/771)) ([fe7e187](https://github.com/loopingz/webda.io/commit/fe7e18786744134fb29447a9f139689abbbd4950))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* **compiler:** generate schemas with @webda/content-mapper ([af3b7c5](https://github.com/loopingz/webda.io/commit/af3b7c5daa3ba239210be2af490850cde3460d84))
* **content-mapper:** TypeScript 7.1 content mapper package ([9b57565](https://github.com/loopingz/webda.io/commit/9b57565a467d83671559fa4e2411124a5ae51109))
* **core:** flat models[] config + internal field migration (PR 1 of 3) ([#776](https://github.com/loopingz/webda.io/issues/776)) ([56d4b01](https://github.com/loopingz/webda.io/commit/56d4b01524be424508b80e2f1ed4f388174d73ad))
* **fs:** unix-socket-based pub/sub for single-host IPC ([#773](https://github.com/loopingz/webda.io/issues/773)) ([d73f63f](https://github.com/loopingz/webda.io/commit/d73f63f804e171c03425b59dfd655c52304e55b6))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* Repository typed events, consumer migration + API positioning (PR 2+3 of 3) ([#777](https://github.com/loopingz/webda.io/issues/777)) ([70b0a75](https://github.com/loopingz/webda.io/commit/70b0a755fbeb430297cc161777a41acc2f8db14b))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* **compiler:** make webdac code a working migration tool ([578ca7b](https://github.com/loopingz/webda.io/commit/578ca7b5243701a4ba1d9a9685c38b2f89ac27ed))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/utils bumped to 4.0.0-beta.4
    * @webda/ql bumped to 4.0.0-beta.1
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>gcp: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/gcp-v4.0.0-beta.3...gcp-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/ql bumped to 4.0.0-beta.1
    * @webda/utils bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>google-auth: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/google-auth-v4.0.0-beta.3...google-auth-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.1
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>graphql: 4.0.0-beta.1</summary>

## [4.0.0-beta.1](https://github.com/loopingz/webda.io/compare/graphql-v4.0.0-beta.3...graphql-v4.0.0-beta.1) (2026-10-05)


###   BREAKING CHANGES

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
* **compiler:** model relations are now `type: "string"` in Input, Output and Stored schemas instead of an object with no properties, and six services gain the `type` property they inherit from ServiceParameters. Anything generated from these schemas  API validation, client types  changes with them.
* remove node 18 support
* remove expose for Store

### Features

* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* add service client event option ([cf68e7f](https://github.com/loopingz/webda.io/commit/cf68e7fa59ec26fc4e49ff593a6de4f53ea029c4))
* blog-system Binary/Binaries demo + e2e suite, with framework fixes ([#771](https://github.com/loopingz/webda.io/issues/771)) ([fe7e187](https://github.com/loopingz/webda.io/commit/fe7e18786744134fb29447a9f139689abbbd4950))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* **compiler:** generate schemas with @webda/content-mapper ([af3b7c5](https://github.com/loopingz/webda.io/commit/af3b7c5daa3ba239210be2af490850cde3460d84))
* **content-mapper:** TypeScript 7.1 content mapper package ([9b57565](https://github.com/loopingz/webda.io/commit/9b57565a467d83671559fa4e2411124a5ae51109))
* enhance debug panels ([#759](https://github.com/loopingz/webda.io/issues/759)) ([63e6e0c](https://github.com/loopingz/webda.io/commit/63e6e0c3bd7d72fb06b148c7344eb3021d186ae9))
* improve caching module ([08b2db5](https://github.com/loopingz/webda.io/commit/08b2db5d96cc4553d5ff2919cbf00287192b4ff6))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* remove expose for Store ([c8a36b1](https://github.com/loopingz/webda.io/commit/c8a36b19c81b830e9c03195388b402e53f987e6e))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))
* Repository typed events, consumer migration + API positioning (PR 2+3 of 3) ([#777](https://github.com/loopingz/webda.io/issues/777)) ([70b0a75](https://github.com/loopingz/webda.io/commit/70b0a755fbeb430297cc161777a41acc2f8db14b))
* separate WebdaQL module ([69beabb](https://github.com/loopingz/webda.io/commit/69beabb0d1715ab81636338509539ade89c07c6a))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* **compiler:** make webdac code a working migration tool ([578ca7b](https://github.com/loopingz/webda.io/commit/578ca7b5243701a4ba1d9a9685c38b2f89ac27ed))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Miscellaneous Chores

* prepare version for 4.0 ([24e8e78](https://github.com/loopingz/webda.io/commit/24e8e789b8e4ac2364ac0d1669b115237ff4be6d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/ql bumped to 4.0.0-beta.1
    * @webda/runtime bumped to 4.0.0-beta.1
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
</details>

<details><summary>grpc: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/grpc-v4.0.0-beta.3...grpc-v4.0.0-beta.4) (2026-10-05)


###   BREAKING CHANGES

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
* **compiler:** model relations are now `type: "string"` in Input, Output and Stored schemas instead of an object with no properties, and six services gain the `type` property they inherit from ServiceParameters. Anything generated from these schemas  API validation, client types  changes with them.

### Features

* add build hooks ([97016bc](https://github.com/loopingz/webda.io/commit/97016bcb9a7becfa87793fa6cc408784487e7e07))
* add grpc module and sample-app webui ([#756](https://github.com/loopingz/webda.io/issues/756)) ([4a7df9a](https://github.com/loopingz/webda.io/commit/4a7df9aacff8ca5e16c57e5fa9f2e2f0dc786e2f))
* blog-system Binary/Binaries demo + e2e suite, with framework fixes ([#771](https://github.com/loopingz/webda.io/issues/771)) ([fe7e187](https://github.com/loopingz/webda.io/commit/fe7e18786744134fb29447a9f139689abbbd4950))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* **compiler:** generate schemas with @webda/content-mapper ([af3b7c5](https://github.com/loopingz/webda.io/commit/af3b7c5daa3ba239210be2af490850cde3460d84))
* **content-mapper:** TypeScript 7.1 content mapper package ([9b57565](https://github.com/loopingz/webda.io/commit/9b57565a467d83671559fa4e2411124a5ae51109))
* enhance debug panels ([#759](https://github.com/loopingz/webda.io/issues/759)) ([63e6e0c](https://github.com/loopingz/webda.io/commit/63e6e0c3bd7d72fb06b148c7344eb3021d186ae9))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* **compiler:** make webdac code a working migration tool ([578ca7b](https://github.com/loopingz/webda.io/commit/578ca7b5243701a4ba1d9a9685c38b2f89ac27ed))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/test bumped to 4.0.0-beta.4
    * @webda/utils bumped to 4.0.0-beta.4
</details>

<details><summary>hawk: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/hawk-v4.0.0-beta.3...hawk-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.1
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>kubernetes: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/kubernetes-v4.0.0-beta.3...kubernetes-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/async bumped to 4.0.0-beta.4
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/utils bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>mcp: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/mcp-v4.0.0-beta.3...mcp-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/test bumped to 4.0.0-beta.4
    * @webda/utils bumped to 4.0.0-beta.4
</details>

<details><summary>mock: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/mock-v4.0.0-beta.3...mock-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/models bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/test bumped to 4.0.0-beta.4
  * peerDependencies
    * @webda/core bumped to 4.0.0-beta.1
</details>

<details><summary>models: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/models-v4.0.0-beta.3...models-v4.0.0-beta.4) (2026-10-05)


###   BREAKING CHANGES

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
* **compiler:** model relations are now `type: "string"` in Input, Output and Stored schemas instead of an object with no properties, and six services gain the `type` property they inherit from ServiceParameters. Anything generated from these schemas  API validation, client types  changes with them.

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
* **mock:** add @webda/mock  coherent mock-data generation for models ([#761](https://github.com/loopingz/webda.io/issues/761)) ([c15a9b1](https://github.com/loopingz/webda.io/commit/c15a9b1b301ff42d99eac61affde6874dd78a0e4))
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
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/serialize bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
    * @webda/tsc-esm bumped to 4.0.0-beta.1
  * peerDependencies
    * @webda/ql bumped to 4.0.0-beta.1
    * @webda/utils bumped to 4.0.0-beta.4
</details>

<details><summary>mongo: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/mongo-v4.0.0-beta.3...mongo-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/ql bumped to 4.0.0-beta.1
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>otel: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/otel-v4.0.0-beta.3...otel-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.1
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>postgres: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/postgres-v4.0.0-beta.3...postgres-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/ql bumped to 4.0.0-beta.1
    * @webda/utils bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>ql: 4.0.0-beta.1</summary>

## [4.0.0-beta.1](https://github.com/loopingz/webda.io/compare/ql-v4.0.0-beta.3...ql-v4.0.0-beta.1) (2026-10-05)


###   BREAKING CHANGES

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
* remove expose for Store

### Features

* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* **ql:** bind ? and :name query parameters ([#788](https://github.com/loopingz/webda.io/issues/788)) ([4a8647b](https://github.com/loopingz/webda.io/commit/4a8647bb9e8e7eedb1aeadf5e5bc77749437b440))
* **ql:** support IS NULL and IS NOT NULL ([553d143](https://github.com/loopingz/webda.io/commit/553d143b8513c309ca93f9b071b4029ca2649f5f))
* **ql:** TRUE and FALSE as expressions ([9116440](https://github.com/loopingz/webda.io/commit/91164406b59ee7f811b6d7db783cac89cd3ac45b))
* remove expose for Store ([c8a36b1](https://github.com/loopingz/webda.io/commit/c8a36b19c81b830e9c03195388b402e53f987e6e))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))
* separate WebdaQL module ([69beabb](https://github.com/loopingz/webda.io/commit/69beabb0d1715ab81636338509539ade89c07c6a))
* update watchers on service parameter on update ([f3417d7](https://github.com/loopingz/webda.io/commit/f3417d7004babaa6718012a68383bf19301a85fa))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* prepend query now use WebdaQL parser ([#681](https://github.com/loopingz/webda.io/issues/681)) ([b640244](https://github.com/loopingz/webda.io/commit/b6402441096975861ac222b682bf8ae17ba3a36d))
* **ql:** escape backslashes in WebdaQL string literals ([6de215b](https://github.com/loopingz/webda.io/commit/6de215b082ad99eaea7c094f470cd81b30eac71d))
* **ql:** LIKE on a missing attribute no longer throws ([b66cade](https://github.com/loopingz/webda.io/commit/b66cade2e2773ac88731efa3b4233573ef2e96d3))
* **ql:** rewrite interpolated null values to IS NULL / IS NOT NULL ([bf7697b](https://github.com/loopingz/webda.io/commit/bf7697b84ed55042911f5469d098f1a2ca94f70f))
* **ql:** unescape quoted string literals ([4cecfbc](https://github.com/loopingz/webda.io/commit/4cecfbc6e2db8fdaf709c0acf5d193d875f5fb12))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Continuous Integration

* update additional modules ([77b32e9](https://github.com/loopingz/webda.io/commit/77b32e9dbd950ddaebe11cda22c20d71ab7f309a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>runtime: 4.0.0-beta.1</summary>

## [4.0.0-beta.1](https://github.com/loopingz/webda.io/compare/runtime-v4.0.0-beta.3...runtime-v4.0.0-beta.1) (2026-10-05)


###   BREAKING CHANGES

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
* **compiler:** model relations are now `type: "string"` in Input, Output and Stored schemas instead of an object with no properties, and six services gain the `type` property they inherit from ServiceParameters. Anything generated from these schemas  API validation, client types  changes with them.
* remove node 18 support
* remove expose for Store

### Features

* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* allow cluster member info to be extended ([cb1e982](https://github.com/loopingz/webda.io/commit/cb1e982814357145a47c5cfd039a7bacee379d86))
* blog-system Binary/Binaries demo + e2e suite, with framework fixes ([#771](https://github.com/loopingz/webda.io/issues/771)) ([fe7e187](https://github.com/loopingz/webda.io/commit/fe7e18786744134fb29447a9f139689abbbd4950))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* **cluster:** add outofsync alert tweaking option ([b3e5d91](https://github.com/loopingz/webda.io/commit/b3e5d91ac1d8732f9f2819c1628a3bfb71de51e5))
* **compiler:** generate schemas with @webda/content-mapper ([af3b7c5](https://github.com/loopingz/webda.io/commit/af3b7c5daa3ba239210be2af490850cde3460d84))
* **content-mapper:** TypeScript 7.1 content mapper package ([9b57565](https://github.com/loopingz/webda.io/commit/9b57565a467d83671559fa4e2411124a5ae51109))
* **core:** flat models[] config + internal field migration (PR 1 of 3) ([#776](https://github.com/loopingz/webda.io/issues/776)) ([56d4b01](https://github.com/loopingz/webda.io/commit/56d4b01524be424508b80e2f1ed4f388174d73ad))
* enhance debug panels ([#759](https://github.com/loopingz/webda.io/issues/759)) ([63e6e0c](https://github.com/loopingz/webda.io/commit/63e6e0c3bd7d72fb06b148c7344eb3021d186ae9))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* remove expose for Store ([c8a36b1](https://github.com/loopingz/webda.io/commit/c8a36b19c81b830e9c03195388b402e53f987e6e))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))
* separate WebdaQL module ([69beabb](https://github.com/loopingz/webda.io/commit/69beabb0d1715ab81636338509539ade89c07c6a))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* **ci:** pnpm explicit dependency to @webda/workout ([7e1f05e](https://github.com/loopingz/webda.io/commit/7e1f05ed030d6ad0c593da8683c1c347ad2fd08b))
* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* **compiler:** make webdac code a working migration tool ([578ca7b](https://github.com/loopingz/webda.io/commit/578ca7b5243701a4ba1d9a9685c38b2f89ac27ed))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Miscellaneous Chores

* prepare version for 4.0 ([24e8e78](https://github.com/loopingz/webda.io/commit/24e8e789b8e4ac2364ac0d1669b115237ff4be6d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/models bumped to 4.0.0-beta.4
    * @webda/ql bumped to 4.0.0-beta.1
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>serialize: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/serialize-v4.0.0-beta.3...serialize-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>test: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/test-v4.0.0-beta.3...test-v4.0.0-beta.4) (2026-10-05)


### Features

* add @webda/test module ([158a343](https://github.com/loopingz/webda.io/commit/158a343461d83ae0ffebe4b71983a850b0a7ab26))
* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* add new @webda/decorators module ([7c222f1](https://github.com/loopingz/webda.io/commit/7c222f19bd70891c688ed00c360f5733a94a2b7e))
* add the test method in after/beforeEach ([dd830e5](https://github.com/loopingz/webda.io/commit/dd830e527406e40ec1d43e5bcd4afbd6786f4c3c))
* improve caching module ([08b2db5](https://github.com/loopingz/webda.io/commit/08b2db5d96cc4553d5ff2919cbf00287192b4ff6))
* move iterator consumers to @webda/test ([18cdecd](https://github.com/loopingz/webda.io/commit/18cdecddf1ec3c57e5fb733f8fffc491f0f39a81))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* update @webda/test to use new annotations ([15e8b30](https://github.com/loopingz/webda.io/commit/15e8b30506043fb9cfe6ac544c0093496a07d6fc))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* move tsc-esm to TS5 decorators ([f626693](https://github.com/loopingz/webda.io/commit/f6266932742d87e7cc591ed9433eee22209977f6))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))
</details>

<details><summary>tsc-esm: 4.0.0-beta.1</summary>

## [4.0.0-beta.1](https://github.com/loopingz/webda.io/compare/tsc-esm-v4.0.0-beta.3...tsc-esm-v4.0.0-beta.1) (2026-10-05)


###   BREAKING CHANGES

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
* operations system  decouple operations from transport ([#753](https://github.com/loopingz/webda.io/issues/753)) ([54f3151](https://github.com/loopingz/webda.io/commit/54f3151686b9115221790e90c3ee723fb0b8c873))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* dynamic import ([5f9daa9](https://github.com/loopingz/webda.io/commit/5f9daa99abe30d2f727319c7f562fc11144baf23))
* move to nodenext module and update Inject annotation ([d7d85e4](https://github.com/loopingz/webda.io/commit/d7d85e4dc2a73fce5e63429c02663d980515b667))
* move tsc-esm to TS5 decorators ([f626693](https://github.com/loopingz/webda.io/commit/f6266932742d87e7cc591ed9433eee22209977f6))
* sub node module catches ([2b74cb5](https://github.com/loopingz/webda.io/commit/2b74cb59110483bbb6d081df8fb8ca8cec124414))
* symlink isMainModule ([7918dd1](https://github.com/loopingz/webda.io/commit/7918dd1704a3efff2afee7cf424d14d402b331e2))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))
* update repository to use StorableClass ([f79fc19](https://github.com/loopingz/webda.io/commit/f79fc198bf176ca5baa224ad1c3aab83b5cf9144))


### Miscellaneous Chores

* prepare version for 4.0 ([24e8e78](https://github.com/loopingz/webda.io/commit/24e8e789b8e4ac2364ac0d1669b115237ff4be6d))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>utils: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/utils-v4.0.0-beta.3...utils-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.4
</details>

<details><summary>versioning: 4.0.0-beta.4</summary>

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/versioning-v4.0.0-beta.3...versioning-v4.0.0-beta.4) (2026-10-05)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/models bumped to 4.0.0-beta.4
    * @webda/test bumped to 4.0.0-beta.4
  * peerDependencies
    * @webda/core bumped to 4.0.0-beta.1
    * @webda/models bumped to 4.0.0-beta.4
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).