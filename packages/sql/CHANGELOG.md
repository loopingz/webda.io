# Changelog

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/sql-v4.0.0-beta.4...sql-v4.0.0-beta.5) (2026-10-31)


### Features

* **postgres,sqlite:** operation-scoped transactions in the SQL stores ([#981](https://github.com/loopingz/webda.io/issues/981)) ([ebe633d](https://github.com/loopingz/webda.io/commit/ebe633d054bceebe4302161ee928dc61374f7ab1))
* **postgres:** PostgresRelationalStore – typed tables, foreign keys and junctions from the sql-schema plan ([#1009](https://github.com/loopingz/webda.io/issues/1009)) ([4a823af](https://github.com/loopingz/webda.io/commit/4a823affc982288e86680bedc48198dce294b7d0))
* **sqlite:** SQLiteRelationalStore on the shared relational layer ([#1012](https://github.com/loopingz/webda.io/issues/1012)) ([9de054d](https://github.com/loopingz/webda.io/commit/9de054d55d07c30ff51c70eff8ed2464bc82bffb))
* **sql:** junction-attribute filters, composite references, ModelsMapped filling and the sealed @Index warning ([#1027](https://github.com/loopingz/webda.io/issues/1027)) ([b2cc2c8](https://github.com/loopingz/webda.io/commit/b2cc2c8876b40822e64eb0093aaeba0246197849)), closes [#1026](https://github.com/loopingz/webda.io/issues/1026)
* **sql:** multi-version schema registry for the relational stores ([#1016](https://github.com/loopingz/webda.io/issues/1016)) ([#1024](https://github.com/loopingz/webda.io/issues/1024)) ([1a895d0](https://github.com/loopingz/webda.io/commit/1a895d0dcbfe6dce4c33e1e665e01639f40ada92))


### Bug Fixes

* **sql:** relational store polish: review minors, @Index/@Unique, foreignKeysToJsonb, importFromJsonb ([#1023](https://github.com/loopingz/webda.io/issues/1023)) ([277555f](https://github.com/loopingz/webda.io/commit/277555fb450ef1e926cd4ace68be8cab72d116f3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/sql-schema bumped to 4.0.0-beta.2
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/sql-v4.0.0-beta.3...sql-v4.0.0-beta.4) (2026-10-22)


### Features

* opt-in total count for paginated queries (Repository.count, REST/GraphQL total) ([#967](https://github.com/loopingz/webda.io/issues/967)) ([b43e6d1](https://github.com/loopingz/webda.io/commit/b43e6d18820773d24a8b754013dc4dec4c57e1c7))


### Bug Fixes

* **sql:** match an absent field in write conditions with IS NULL ([#936](https://github.com/loopingz/webda.io/issues/936)) ([df61645](https://github.com/loopingz/webda.io/commit/df61645951da9223ca6ca8281297bff086babbbe)), closes [#935](https://github.com/loopingz/webda.io/issues/935)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.12
    * @webda/ql bumped to 4.0.0-beta.9
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.12
    * @webda/test bumped to 4.0.0-beta.8

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/sql-v4.0.0-beta.2...sql-v4.0.0-beta.3) (2026-10-16)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.11
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.11

## [4.0.0-beta.2](https://github.com/loopingz/webda.io/compare/sql-v4.0.0-beta.1...sql-v4.0.0-beta.2) (2026-10-15)


### Features

* **sqlite:** SQLiteStore, SQLiteQueue, SQLitePubSub on node:sqlite sharing an extracted @webda/sql layer ([#902](https://github.com/loopingz/webda.io/issues/902)) ([e2cdc49](https://github.com/loopingz/webda.io/commit/e2cdc49da423d623ce82ab02b099653f996485a8))


### Bug Fixes

* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.10
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.10
