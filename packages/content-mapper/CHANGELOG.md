# Changelog

## [4.0.0-beta.6](https://github.com/loopingz/webda.io/compare/content-mapper-v4.0.0-beta.5...content-mapper-v4.0.0-beta.6) (2026-10-09)


### ⚠ BREAKING CHANGES

* **ql:** DELETE, UPDATE, SELECT, SET and WHERE are reserved uppercase keywords; Query.type is required; parse().toString() prints the canonical query instead of the source tokens; the root parse rule is now `(statement | filterQuery) EOF` for code walking the ANTLR tree.

### Features

* **ql:** WebdaQL DELETE/UPDATE/SELECT statements, bulk deleteMany/updateMany, filter-only Query operations ([#818](https://github.com/loopingz/webda.io/issues/818)) ([add9503](https://github.com/loopingz/webda.io/commit/add95031aff982cd69a635c519b4ddaa6874ecbe))

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/content-mapper-v4.0.0-beta.4...content-mapper-v4.0.0-beta.5) (2026-10-08)


### Bug Fixes

* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/content-mapper-v4.0.0-beta.1...content-mapper-v4.0.0-beta.4) (2026-10-08)


### ⚠ BREAKING CHANGES

* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800))
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
* **compiler:** model relations are now `type: "string"` in Input, Output and Stored schemas instead of an object with no properties, and six services gain the `type` property they inherit from ServiceParameters. Anything generated from these schemas — API validation, client types — changes with them.

### Features

* add @webda/create (npm create [@webda](https://github.com/webda)) with agent guidance ([#799](https://github.com/loopingz/webda.io/issues/799)) ([e29822a](https://github.com/loopingz/webda.io/commit/e29822a82bca2c58043238001c5c817db91af817))
* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800)) ([74dc5df](https://github.com/loopingz/webda.io/commit/74dc5df103bdf93cdab92b02ef966598e44e2735))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* **compiler:** generate schemas with @webda/content-mapper ([af3b7c5](https://github.com/loopingz/webda.io/commit/af3b7c5daa3ba239210be2af490850cde3460d84))
* **compiler:** optional TypeScript 7 schema backend, off by default ([b58e72c](https://github.com/loopingz/webda.io/commit/b58e72c7f7dc96d21e0fa7368a8b29fddaf4dab3))
* **content-mapper:** close generator parity with the TypeScript 6 transforms ([807688c](https://github.com/loopingz/webda.io/commit/807688c9673e61dc360eba71e4d0ffb176ab860a))
* **content-mapper:** emit-parity oracle for stage 9; drop loadParameters default ([1a32862](https://github.com/loopingz/webda.io/commit/1a328622ece9edb13502fa345cce84cc44924a22))
* **content-mapper:** generate the whole webda.module.json on TypeScript 7.1 ([1996b85](https://github.com/loopingz/webda.io/commit/1996b8566fd301f53718fd25f446d0c8b0a718fe))
* **content-mapper:** model schemas, every divergence now proven ([4f9cc60](https://github.com/loopingz/webda.io/commit/4f9cc6009b64ce029961da4c16711070a04ed15d))
* **content-mapper:** port model structural metadata, verified byte-for-byte ([234c4b4](https://github.com/loopingz/webda.io/commit/234c4b49327896e788f563e6fd0dda300a545cb1))
* **content-mapper:** port Reflection and Relations, verified byte-for-byte ([69c4bb3](https://github.com/loopingz/webda.io/commit/69c4bb3c1c03ba89fc6efb686ddef55d0fdad905))
* **content-mapper:** port the behaviours transform ([04e8559](https://github.com/loopingz/webda.io/commit/04e855940e8553916073f868780bf79692774314))
* **content-mapper:** port the WebdaQL validator ([4ee7137](https://github.com/loopingz/webda.io/commit/4ee7137e32c17abd01638d801c0065c367accfb9))
* **content-mapper:** port Webda object discovery, verified byte-for-byte ([ce63d08](https://github.com/loopingz/webda.io/commit/ce63d080249f23fc2907b08d1119b6b538da38fa))
* **content-mapper:** report duplicate Webda names instead of keeping the last silently ([9bb1818](https://github.com/loopingz/webda.io/commit/9bb18189d67a4e86cafa163db3b22e9c2bd0a265))
* **content-mapper:** schema converter, service parameters identical ([4b88c7b](https://github.com/loopingz/webda.io/commit/4b88c7be979f99d7c39de43e1af96951c849b33c))
* **content-mapper:** top-level schemas, all three groups identical ([074af29](https://github.com/loopingz/webda.io/commit/074af29fd5be5ffe54068a380487f2affe7a1166))
* **content-mapper:** TypeScript 7.1 content mapper package ([9b57565](https://github.com/loopingz/webda.io/commit/9b57565a467d83671559fa4e2411124a5ae51109))
* **content-mapper:** validate the schema port across the monorepo ([ccff4a5](https://github.com/loopingz/webda.io/commit/ccff4a54d09f0fac16b75ce758fc8b2544aae23b))
* **ql:** bind ? and :name query parameters ([#788](https://github.com/loopingz/webda.io/issues/788)) ([4a8647b](https://github.com/loopingz/webda.io/commit/4a8647bb9e8e7eedb1aeadf5e5bc77749437b440))
* **ql:** support IS NULL and IS NOT NULL ([553d143](https://github.com/loopingz/webda.io/commit/553d143b8513c309ca93f9b071b4029ca2649f5f))
* **schema:** out-of-process schema worker, 22 of 29 schemas identical ([d983846](https://github.com/loopingz/webda.io/commit/d983846b33272eea34f1415e1e3ebc66bd4d8135))


### Bug Fixes

* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* **content-mapper:** close the initialiser and constructor-argument gaps ([447e566](https://github.com/loopingz/webda.io/commit/447e5660d8b0f93a9527738965290217ba571cac))
* **content-mapper:** drop the @webda/compiler devDependency cycle ([#802](https://github.com/loopingz/webda.io/issues/802)) ([8af66d6](https://github.com/loopingz/webda.io/commit/8af66d64cde2d6b611eb9d71627f3d61772e8de1))
* **content-mapper:** follow the model base chain through the checker ([fd84a26](https://github.com/loopingz/webda.io/commit/fd84a26cc464a6fa2a7371564549a743f124302f))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Miscellaneous Chores

* delete @webda/schema ([1fbd1a4](https://github.com/loopingz/webda.io/commit/1fbd1a4343cb24be639e35c776129e8fec78e379))
