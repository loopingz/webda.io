# Changelog

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/fs-v4.0.0-beta.12...fs-v4.0.0-beta.13) (2026-10-31)


### Features

* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
    * @webda/ql bumped to 4.0.0-beta.10
  * devDependencies
    * @webda/bench bumped to 4.0.0-beta.13
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9

## [4.0.0-beta.12](https://github.com/loopingz/webda.io/compare/fs-v4.0.0-beta.11...fs-v4.0.0-beta.12) (2026-10-22)


### Features

* **binary:** attach direct uploads on verified client completion ([#944](https://github.com/loopingz/webda.io/issues/944)) ([736942e](https://github.com/loopingz/webda.io/commit/736942eb194f66924ceeaefd14d8515c2d0b84d7))
* opt-in total count for paginated queries (Repository.count, REST/GraphQL total) ([#967](https://github.com/loopingz/webda.io/issues/967)) ([b43e6d1](https://github.com/loopingz/webda.io/commit/b43e6d18820773d24a8b754013dc4dec4c57e1c7))


### Bug Fixes

* **core:** Queue.consume waits between receives returning no message ([#920](https://github.com/loopingz/webda.io/issues/920)) ([7a41465](https://github.com/loopingz/webda.io/commit/7a41465f0afbc264e5409dfd491f3a3212408bf2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.12
    * @webda/utils bumped to 4.0.0-beta.11
    * @webda/workout bumped to 4.0.0-beta.6
    * @webda/ql bumped to 4.0.0-beta.9
  * devDependencies
    * @webda/bench bumped to 4.0.0-beta.12
    * @webda/compiler bumped to 4.0.0-beta.12
    * @webda/test bumped to 4.0.0-beta.8

## [4.0.0-beta.11](https://github.com/loopingz/webda.io/compare/fs-v4.0.0-beta.10...fs-v4.0.0-beta.11) (2026-10-16)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.11
  * devDependencies
    * @webda/bench bumped to 4.0.0-beta.11
    * @webda/compiler bumped to 4.0.0-beta.11

## [4.0.0-beta.10](https://github.com/loopingz/webda.io/compare/fs-v4.0.0-beta.9...fs-v4.0.0-beta.10) (2026-10-15)


### Features

* **bench:** benchmarks for Store, Queue, Pub/Sub and the blog-system application ([#914](https://github.com/loopingz/webda.io/issues/914)) ([#916](https://github.com/loopingz/webda.io/issues/916)) ([aed07ef](https://github.com/loopingz/webda.io/commit/aed07ef3efe25cfd6957eb007a3216e181be7681))
* **core:** URL-addressed getContent / putContent with Readable in and out ([#377](https://github.com/loopingz/webda.io/issues/377)) ([#904](https://github.com/loopingz/webda.io/issues/904)) ([2323103](https://github.com/loopingz/webda.io/commit/2323103b21e5c6b6d3dd31de0398302e9be4ea15))


### Bug Fixes

* **fs:** FileQueue wakes up on new messages instead of sleeping 10s when empty ([#917](https://github.com/loopingz/webda.io/issues/917)) ([4fe2962](https://github.com/loopingz/webda.io/commit/4fe296204c37a61063d27030ce3c816296c9889a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.10
    * @webda/utils bumped to 4.0.0-beta.10
  * devDependencies
    * @webda/bench bumped to 4.0.0-beta.10
    * @webda/compiler bumped to 4.0.0-beta.10

## [4.0.0-beta.9](https://github.com/loopingz/webda.io/compare/fs-v4.0.0-beta.8...fs-v4.0.0-beta.9) (2026-10-14)


### ⚠ BREAKING CHANGES

* the unused store parameters modelAliases, defaultModel and forceModel are removed; use @WebdaAlias for renamed models. The runtime MigrationStore is removed: use webda migrate.

### Features

* transparent Webda 3 → 4 data upgrade — legacy types, store migrations (core) ([#889](https://github.com/loopingz/webda.io/issues/889)) ([#890](https://github.com/loopingz/webda.io/issues/890)) ([01d4efb](https://github.com/loopingz/webda.io/commit/01d4efb22e676111318ee28fdc748575e0c85f33))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.9
    * @webda/utils bumped to 4.0.0-beta.9
    * @webda/ql bumped to 4.0.0-beta.8
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.9

## [4.0.0-beta.8](https://github.com/loopingz/webda.io/compare/fs-v4.0.0-beta.7...fs-v4.0.0-beta.8) (2026-10-12)


### Bug Fixes

* enable strict mode in ql, oci, fs and auth ([#874](https://github.com/loopingz/webda.io/issues/874)) ([dec29f6](https://github.com/loopingz/webda.io/commit/dec29f657429eea40a21f0cae901af1e2c46074d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.8
    * @webda/utils bumped to 4.0.0-beta.8
    * @webda/ql bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.8
    * @webda/test bumped to 4.0.0-beta.7

## [4.0.0-beta.7](https://github.com/loopingz/webda.io/compare/fs-v4.0.0-beta.6...fs-v4.0.0-beta.7) (2026-10-11)


### Bug Fixes

* support Windows paths when loading and building modules ([#827](https://github.com/loopingz/webda.io/issues/827)) ([0d88747](https://github.com/loopingz/webda.io/commit/0d8874761196fcf09ac72bf9dc5bb31f8cfb87e1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.7
    * @webda/utils bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.7

## [4.0.0-beta.6](https://github.com/loopingz/webda.io/compare/fs-v4.0.0-beta.5...fs-v4.0.0-beta.6) (2026-10-09)


### ⚠ BREAKING CHANGES

* **ql:** DELETE, UPDATE, SELECT, SET and WHERE are reserved uppercase keywords; Query.type is required; parse().toString() prints the canonical query instead of the source tokens; the root parse rule is now `(statement | filterQuery) EOF` for code walking the ANTLR tree.

### Features

* **ql:** WebdaQL DELETE/UPDATE/SELECT statements, bulk deleteMany/updateMany, filter-only Query operations ([#818](https://github.com/loopingz/webda.io/issues/818)) ([add9503](https://github.com/loopingz/webda.io/commit/add95031aff982cd69a635c519b4ddaa6874ecbe))
* store-agnostic aggregations (Model.aggregate, SELECT … GROUP BY) ([#820](https://github.com/loopingz/webda.io/issues/820)) ([9eca947](https://github.com/loopingz/webda.io/commit/9eca947fdd0cbf456690cb61c9a30c66c22be1ad))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.6
    * @webda/utils bumped to 4.0.0-beta.6
    * @webda/ql bumped to 4.0.0-beta.6
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.6
    * @webda/test bumped to 4.0.0-beta.6

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/fs-v4.0.0-beta.4...fs-v4.0.0-beta.5) (2026-10-08)


### ⚠ BREAKING CHANGES

* **core:** models defining canAct are now enforced on REST, gRPC and MCP operations; refused calls return 403. Query pages can be shorter than their LIMIT. OwnerModel ignores a client supplied _user. ResourceAcl.canAct signature changed to (context, action) and entries need a principal.

### Bug Fixes

* **core:** enforce model permissions on every transport, deny by default ([#810](https://github.com/loopingz/webda.io/issues/810)) ([24c1182](https://github.com/loopingz/webda.io/commit/24c11824f38999ef28ec7795c8af8d0ba862d9be))
* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.5
    * @webda/utils bumped to 4.0.0-beta.5
    * @webda/workout bumped to 4.0.0-beta.5
    * @webda/ql bumped to 4.0.0-beta.5
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.5
    * @webda/test bumped to 4.0.0-beta.5

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/fs-v4.0.0-beta.3...fs-v4.0.0-beta.4) (2026-10-08)


### ⚠ BREAKING CHANGES

* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800))

### Features

* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800)) ([74dc5df](https://github.com/loopingz/webda.io/commit/74dc5df103bdf93cdab92b02ef966598e44e2735))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.4
    * @webda/utils bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/fs-v4.0.0-beta.1...fs-v4.0.0-beta.3) (2026-10-05)


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
    * @webda/core bumped to 4.0.0-beta.3
    * @webda/utils bumped to 4.0.0-beta.3
    * @webda/workout bumped to 4.0.0-beta.3
    * @webda/ql bumped to 4.0.0-beta.3
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.3
    * @webda/test bumped to 4.0.0-beta.3
