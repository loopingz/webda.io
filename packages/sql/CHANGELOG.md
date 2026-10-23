# Changelog

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/sql-v4.0.0-beta.4...sql-v4.0.0-beta.5) (2026-10-23)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13

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
