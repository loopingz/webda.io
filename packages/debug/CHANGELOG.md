# Changelog

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/debug-v4.0.0-beta.1...debug-v4.0.0-beta.3) (2026-10-05)


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

* add @webda/debug package — introspection API + WebSocket live events ([#750](https://github.com/loopingz/webda.io/issues/750)) ([307b2f2](https://github.com/loopingz/webda.io/commit/307b2f2267f2eacd1be8ec4a44f47999e0c61931))
* add Behavior and move Binary to Behavior ([ef05efb](https://github.com/loopingz/webda.io/commit/ef05efb3c7910d014336d3a3a0a102dfff38a1b6))
* blog-system Binary/Binaries demo + e2e suite, with framework fixes ([#771](https://github.com/loopingz/webda.io/issues/771)) ([fe7e187](https://github.com/loopingz/webda.io/commit/fe7e18786744134fb29447a9f139689abbbd4950))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* **compiler:** generate schemas with @webda/content-mapper ([af3b7c5](https://github.com/loopingz/webda.io/commit/af3b7c5daa3ba239210be2af490850cde3460d84))
* **content-mapper:** TypeScript 7.1 content mapper package ([9b57565](https://github.com/loopingz/webda.io/commit/9b57565a467d83671559fa4e2411124a5ae51109))
* **debug:** capture request/response details + 4xx error UX fixes ([#769](https://github.com/loopingz/webda.io/issues/769)) ([9709f47](https://github.com/loopingz/webda.io/commit/9709f47defe62b38788454734c88210641f5506a))
* default REST routes for operations, bean service fixes ([#755](https://github.com/loopingz/webda.io/issues/755)) ([ccebecf](https://github.com/loopingz/webda.io/commit/ccebecfe37fe5417f36a689fe4973901e450c82a))
* enhance debug panels ([#759](https://github.com/loopingz/webda.io/issues/759)) ([63e6e0c](https://github.com/loopingz/webda.io/commit/63e6e0c3bd7d72fb06b148c7344eb3021d186ae9))
* operation return values, HttpServer routing, and models fixes ([#754](https://github.com/loopingz/webda.io/issues/754)) ([0779301](https://github.com/loopingz/webda.io/commit/0779301fbcf066dcac1362396842b9aae65b6e59))
* operations system — decouple operations from transport ([#753](https://github.com/loopingz/webda.io/issues/753)) ([54f3151](https://github.com/loopingz/webda.io/commit/54f3151686b9115221790e90c3ee723fb0b8c873))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* **compiler:** make webdac code a working migration tool ([578ca7b](https://github.com/loopingz/webda.io/commit/578ca7b5243701a4ba1d9a9685c38b2f89ac27ed))
* **rest,debug:** give model PATCH its own OpenAPI operation and URL ([f3161b1](https://github.com/loopingz/webda.io/commit/f3161b1fc562e03408f7f93658fab99c9c3ec53f))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/utils bumped to 4.0.0-beta.3
    * @webda/workout bumped to 4.0.0-beta.3
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.3
    * @webda/core bumped to 4.0.0-beta.3
    * @webda/test bumped to 4.0.0-beta.3
  * peerDependencies
    * @webda/core bumped from ^4.0.0-beta.1 to ^4.0.0-beta.3
