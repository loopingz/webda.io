# Changelog

## [4.0.0-beta.2](https://github.com/loopingz/webda.io/compare/sql-schema-v4.0.0-beta.1...sql-schema-v4.0.0-beta.2) (2026-10-31)


### Features

* **compiler,models:** record delete policies on relations ([#982](https://github.com/loopingz/webda.io/issues/982)) ([7cd83af](https://github.com/loopingz/webda.io/commit/7cd83afd16fa5af6b6c5816bbb2f05257362bd89))
* **postgres:** PostgresRelationalStore – typed tables, foreign keys and junctions from the sql-schema plan ([#1009](https://github.com/loopingz/webda.io/issues/1009)) ([4a823af](https://github.com/loopingz/webda.io/commit/4a823affc982288e86680bedc48198dce294b7d0))
* **sql:** junction-attribute filters, composite references, ModelsMapped filling and the sealed @Index warning ([#1027](https://github.com/loopingz/webda.io/issues/1027)) ([b2cc2c8](https://github.com/loopingz/webda.io/commit/b2cc2c8876b40822e64eb0093aaeba0246197849)), closes [#1026](https://github.com/loopingz/webda.io/issues/1026)
* **sql:** multi-version schema registry for the relational stores ([#1016](https://github.com/loopingz/webda.io/issues/1016)) ([#1024](https://github.com/loopingz/webda.io/issues/1024)) ([1a895d0](https://github.com/loopingz/webda.io/commit/1a895d0dcbfe6dce4c33e1e665e01639f40ada92))


### Bug Fixes

* **sql:** relational store polish: review minors, @Index/@Unique, foreignKeysToJsonb, importFromJsonb ([#1023](https://github.com/loopingz/webda.io/issues/1023)) ([277555f](https://github.com/loopingz/webda.io/commit/277555fb450ef1e926cd4ace68be8cab72d116f3))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/models bumped to 4.0.0-beta.13
  * peerDependencies
    * @webda/models bumped to 4.0.0-beta.13

## [4.0.0-beta.1](https://github.com/loopingz/webda.io/compare/sql-schema-v4.0.0-beta.0...sql-schema-v4.0.0-beta.1) (2026-10-22)


### Features

* **sql-schema:** relational schema plan built from model metadata ([#937](https://github.com/loopingz/webda.io/issues/937)) ([6f50192](https://github.com/loopingz/webda.io/commit/6f5019210a7a3f84bddad061db931c31d98f4524))


### Bug Fixes

* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))
