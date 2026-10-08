# Changelog

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.2.2 to ^3.3.0
  * devDependencies
    * @webda/shell bumped from ^3.1.5 to ^3.2.0

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.3.0 to ^3.4.0
  * devDependencies
    * @webda/shell bumped from ^3.2.0 to ^3.2.1

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.5.0 to ^3.6.0
  * devDependencies
    * @webda/shell bumped from ^3.3.0 to ^3.4.0

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.7.0 to ^3.8.0
  * devDependencies
    * @webda/shell bumped from ^3.5.0 to ^3.6.0

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.8.0 to ^3.8.1
  * devDependencies
    * @webda/shell bumped from ^3.6.0 to ^3.6.1

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.9.0 to ^3.9.1
  * devDependencies
    * @webda/shell bumped from ^3.6.2 to ^3.6.3

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.9.1 to ^3.10.0
  * devDependencies
    * @webda/shell bumped from ^3.6.3 to ^3.7.0

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.11.1 to ^3.11.2
  * devDependencies
    * @webda/shell bumped from ^3.8.1 to ^3.8.2

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.12.0 to ^3.13.0
  * devDependencies
    * @webda/shell bumped from ^3.9.0 to ^3.9.1

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.13.0 to ^3.13.1
  * devDependencies
    * @webda/shell bumped from ^3.9.1 to ^3.9.2

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.14.0 to ^3.15.0
  * devDependencies
    * @webda/shell bumped from ^3.9.4 to ^3.10.0

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.15.1 to ^3.16.0
  * devDependencies
    * @webda/shell bumped from ^3.10.1 to ^3.11.0

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/postgres-v4.0.0-beta.4...postgres-v4.0.0-beta.5) (2026-10-08)


### ⚠ BREAKING CHANGES

* **core:** models defining canAct are now enforced on REST, gRPC and MCP operations; refused calls return 403. Query pages can be shorter than their LIMIT. OwnerModel ignores a client supplied _user. ResourceAcl.canAct signature changed to (context, action) and entries need a principal.

### Bug Fixes

* **core:** enforce model permissions on every transport, deny by default ([#810](https://github.com/loopingz/webda.io/issues/810)) ([24c1182](https://github.com/loopingz/webda.io/commit/24c11824f38999ef28ec7795c8af8d0ba862d9be))
* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.5
    * @webda/ql bumped to 4.0.0-beta.5
    * @webda/utils bumped to 4.0.0-beta.5
    * @webda/workout bumped to 4.0.0-beta.5
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.5
    * @webda/test bumped to 4.0.0-beta.5

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/postgres-v4.0.0-beta.3...postgres-v4.0.0-beta.4) (2026-10-08)


### ⚠ BREAKING CHANGES

* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800))

### Features

* add @webda/create (npm create [@webda](https://github.com/webda)) with agent guidance ([#799](https://github.com/loopingz/webda.io/issues/799)) ([e29822a](https://github.com/loopingz/webda.io/commit/e29822a82bca2c58043238001c5c817db91af817))
* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800)) ([74dc5df](https://github.com/loopingz/webda.io/commit/74dc5df103bdf93cdab92b02ef966598e44e2735))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.4
    * @webda/utils bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/postgres-v4.0.0-beta.1...postgres-v4.0.0-beta.3) (2026-10-05)


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
* remove node 18 support
* remove expose for Store

### Features

* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* **compiler:** generate schemas with @webda/content-mapper ([af3b7c5](https://github.com/loopingz/webda.io/commit/af3b7c5daa3ba239210be2af490850cde3460d84))
* **content-mapper:** TypeScript 7.1 content mapper package ([9b57565](https://github.com/loopingz/webda.io/commit/9b57565a467d83671559fa4e2411124a5ae51109))
* **core:** flat models[] config + internal field migration (PR 1 of 3) ([#776](https://github.com/loopingz/webda.io/issues/776)) ([56d4b01](https://github.com/loopingz/webda.io/commit/56d4b01524be424508b80e2f1ed4f388174d73ad))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* **postgres:** pubsub + queue services and migrate Store to current core API ([#774](https://github.com/loopingz/webda.io/issues/774)) ([408e229](https://github.com/loopingz/webda.io/commit/408e22983861607dd1d3ef6918cd53e8e27915d1))
* **postgres:** share pg.Pool across services with same config ([#775](https://github.com/loopingz/webda.io/issues/775)) ([9f0155f](https://github.com/loopingz/webda.io/commit/9f0155f53a26b918749d8bb332dc1b78c9701ce9))
* remove expose for Store ([c8a36b1](https://github.com/loopingz/webda.io/commit/c8a36b19c81b830e9c03195388b402e53f987e6e))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))
* Repository typed events, consumer migration + API positioning (PR 2+3 of 3) ([#777](https://github.com/loopingz/webda.io/issues/777)) ([70b0a75](https://github.com/loopingz/webda.io/commit/70b0a755fbeb430297cc161777a41acc2f8db14b))
* **stores:** translate IS NULL and IS NOT NULL ([8dc727b](https://github.com/loopingz/webda.io/commit/8dc727b0aff4be2f7052f5c5799049de9819f2b6))


### Bug Fixes

* coalesce on attribute ([f593ab0](https://github.com/loopingz/webda.io/commit/f593ab03db5458cbbeef12c72e0f9b64f0a679b6))
* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* **compiler:** make webdac code a working migration tool ([578ca7b](https://github.com/loopingz/webda.io/commit/578ca7b5243701a4ba1d9a9685c38b2f89ac27ed))
* **core:** make audit read operations opt-in and record the saved key on Create ([f1b25f5](https://github.com/loopingz/webda.io/commit/f1b25f571e58ddf514c2ff0b2b67cdd347e52ec0))
* move to nodenext module and update Inject annotation ([d7d85e4](https://github.com/loopingz/webda.io/commit/d7d85e4dc2a73fce5e63429c02663d980515b667))
* post-migration follow-ups (store create uuid, LambdaServer stage, drop workarounds) ([#784](https://github.com/loopingz/webda.io/issues/784)) ([7eead4d](https://github.com/loopingz/webda.io/commit/7eead4d71152c19abaa834817b8bf4a7f89818d1))
* **stores:** escape WebdaQL string values and handle TRUE/FALSE in query translators ([d02f0a2](https://github.com/loopingz/webda.io/commit/d02f0a2307ba8f32ec5d16bb1e214f32aa68dd06))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.3
    * @webda/ql bumped to 4.0.0-beta.3
    * @webda/utils bumped to 4.0.0-beta.3
    * @webda/workout bumped to 4.0.0-beta.3
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.3
    * @webda/test bumped to 4.0.0-beta.3

## [4.0.0-beta.1](https://github.com/loopingz/webda.io/compare/postgres-v3.4.3...postgres-v4.0.0-beta.1) (2024-08-14)


### Features

* separate WebdaQL module ([69beabb](https://github.com/loopingz/webda.io/commit/69beabb0d1715ab81636338509539ade89c07c6a))


### Miscellaneous Chores

* prepare version for 4.0 ([24e8e78](https://github.com/loopingz/webda.io/commit/24e8e789b8e4ac2364ac0d1669b115237ff4be6d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.16.0 to ^4.0.0-beta.1
  * devDependencies
    * @webda/shell bumped from ^3.11.0 to ^4.0.0-beta.1

## [3.4.2](https://github.com/loopingz/webda.io/compare/postgres-v3.4.1...postgres-v3.4.2) (2024-05-19)


### Bug Fixes

* update in otel and json-schema-generator ([c1d9866](https://github.com/loopingz/webda.io/commit/c1d9866ffc6717b622c4e4d72682ef91dc187a12))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.15.0 to ^3.15.1
  * devDependencies
    * @webda/shell bumped from ^3.10.0 to ^3.10.1

## [3.4.0](https://github.com/loopingz/webda.io/compare/postgres-v3.3.4...postgres-v3.4.0) (2024-02-04)


### Features

* **postgres:** add option to create views for each models ([1830dc4](https://github.com/loopingz/webda.io/commit/1830dc43e76626ca8832b83548034acbff79e73b))


### Bug Fixes

* postgres exports ([d7e0967](https://github.com/loopingz/webda.io/commit/d7e0967fe296dfd78862a202281ed2dbd6c24dc0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.13.2 to ^3.14.0
  * devDependencies
    * @webda/shell bumped from ^3.9.3 to ^3.9.4

## [3.3.4](https://github.com/loopingz/webda.io/compare/postgres-v3.3.3...postgres-v3.3.4) (2024-01-22)


### Bug Fixes

* **postgres:** use bigint instead of int for big number ([f8b5a13](https://github.com/loopingz/webda.io/commit/f8b5a13f244f58cfb9832ca5d34385a7e62c66c5))

## [3.3.3](https://github.com/loopingz/webda.io/compare/postgres-v3.3.2...postgres-v3.3.3) (2024-01-22)


### Bug Fixes

* numeric equals on postgres ([75f5e36](https://github.com/loopingz/webda.io/commit/75f5e36e1517a29f99c99e7e4af0e4d5da9ba8bd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.13.1 to ^3.13.2
  * devDependencies
    * @webda/shell bumped from ^3.9.2 to ^3.9.3

## [3.3.0](https://github.com/loopingz/webda.io/compare/postgres-v3.2.5...postgres-v3.3.0) (2024-01-09)


### Features

* add mutations on graphql ([fa3d647](https://github.com/loopingz/webda.io/commit/fa3d647eea8883ecf20bfd4d947f3f99ad05a0f3))
* add subscription system ([b4f625c](https://github.com/loopingz/webda.io/commit/b4f625c44a306f57c7cc44b3aae805b1e6537c52))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.11.2 to ^3.12.0
  * devDependencies
    * @webda/shell bumped from ^3.8.2 to ^3.9.0

## [3.2.4](https://github.com/loopingz/webda.io/compare/postgres-v3.2.3...postgres-v3.2.4) (2023-12-04)


### Bug Fixes

* allow Binaries to define metadata and metadata schema ([2001b1e](https://github.com/loopingz/webda.io/commit/2001b1e9a43b415a25e9e7726e94d351d1749e51))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.11.0 to ^3.11.1
  * devDependencies
    * @webda/shell bumped from ^3.8.0 to ^3.8.1

## [3.2.3](https://github.com/loopingz/webda.io/compare/postgres-v3.2.2...postgres-v3.2.3) (2023-11-30)


### Bug Fixes

* **tsc-esm:** node module import rewrite .js ([e4a15ae](https://github.com/loopingz/webda.io/commit/e4a15ae90a761620520cb890fa5a9121415c453b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.10.0 to ^3.11.0
  * devDependencies
    * @webda/shell bumped from ^3.7.0 to ^3.8.0

## [3.2.0](https://github.com/loopingz/webda.io/compare/postgres-v3.1.2...postgres-v3.2.0) (2023-11-18)


### Features

* add autoCreate table ([67678bd](https://github.com/loopingz/webda.io/commit/67678bdf0b7e039eeb6909d06c25e7076b0453bb))


### Bug Fixes

* links with __ prefix misplaced with ___ by escapeName ([6a5a8b9](https://github.com/loopingz/webda.io/commit/6a5a8b91ae9e02d65b0a8db6c3647d5108de104f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.8.1 to ^3.9.0
  * devDependencies
    * @webda/shell bumped from ^3.6.1 to ^3.6.2

## [3.1.0](https://github.com/loopingz/webda.io/compare/postgres-v3.0.12...postgres-v3.1.0) (2023-11-12)


### Features

* drop node16 as it is EOL ([a6b795a](https://github.com/loopingz/webda.io/commit/a6b795a76e5089a0cf81269c49e00131bc17c1a9))
* RESTDomainService: add the url info retriever on Binaries ([13fe77c](https://github.com/loopingz/webda.io/commit/13fe77ccd0082432ea79ec9b7c32ac261cebeb01))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.6.0 to ^3.7.0
  * devDependencies
    * @webda/shell bumped from ^3.4.0 to ^3.5.0

## [3.0.11](https://github.com/loopingz/webda.io/compare/postgres-v3.0.10...postgres-v3.0.11) (2023-10-04)


### Bug Fixes

* default toLowerCase for k8s resources name ([aaa0d58](https://github.com/loopingz/webda.io/commit/aaa0d5844f12532d2eb3a5813968a730deb4d4d0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.4.0 to ^3.5.0
  * devDependencies
    * @webda/shell bumped from ^3.2.1 to ^3.3.0

## [3.0.8](https://github.com/loopingz/webda.io/compare/postgres-v3.0.7...postgres-v3.0.8) (2023-07-19)


### Bug Fixes

* make values optional to allow downward compatibility ([c0fec4f](https://github.com/loopingz/webda.io/commit/c0fec4fb21dba5e6c97f3ff87e15bf0abf2334bc))
* use query parameter values ([37cb375](https://github.com/loopingz/webda.io/commit/37cb375fb5b1259b3082e26bda400d47ed1ace70))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.2.1 to ^3.2.2
  * devDependencies
    * @webda/shell bumped from ^3.1.4 to ^3.1.5
