# Changelog

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/offline-v4.0.0-beta.12...offline-v4.0.0-beta.13) (2026-11-02)


### Features

* **core:** hand the caller context to getProtectedAttributes (per-caller field write rules) ([#1020](https://github.com/loopingz/webda.io/issues/1020)) ([8118f69](https://github.com/loopingz/webda.io/commit/8118f698a2730f207f8e6623a35480d00a37ab47))
* **sealed:** offline decrypt-on-read, sealed-field query warning, escrow kid precondition, set size cap ([#1022](https://github.com/loopingz/webda.io/issues/1022)) ([5be9b53](https://github.com/loopingz/webda.io/commit/5be9b53aafacda210eda0163158273444d5c471a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/versioning bumped to 4.0.0-beta.13
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9

## [4.0.0-beta.12](https://github.com/loopingz/webda.io/compare/offline-v4.0.0-beta.11...offline-v4.0.0-beta.12) (2026-10-22)


### Bug Fixes

* **content-mapper:** list Events of an optional [WEBDA_EVENTS]? member under strict ([#978](https://github.com/loopingz/webda.io/issues/978)) ([c303962](https://github.com/loopingz/webda.io/commit/c30396298c8545f9c1ff5d8c4839191afbd7609f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.12
    * @webda/models bumped to 4.0.0-beta.12
    * @webda/ql bumped to 4.0.0-beta.9
    * @webda/versioning bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.6
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.12
    * @webda/test bumped to 4.0.0-beta.8

## [4.0.0-beta.11](https://github.com/loopingz/webda.io/compare/offline-v4.0.0-beta.10...offline-v4.0.0-beta.11) (2026-10-16)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.11
    * @webda/models bumped to 4.0.0-beta.11
    * @webda/versioning bumped to 4.0.0-beta.11
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.11

## [4.0.0-beta.10](https://github.com/loopingz/webda.io/compare/offline-v4.0.0-beta.9...offline-v4.0.0-beta.10) (2026-10-15)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.10
    * @webda/models bumped to 4.0.0-beta.10
    * @webda/versioning bumped to 4.0.0-beta.10
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.10

## [4.0.0-beta.9](https://github.com/loopingz/webda.io/compare/offline-v4.0.0-beta.8...offline-v4.0.0-beta.9) (2026-10-14)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.9
    * @webda/models bumped to 4.0.0-beta.9
    * @webda/ql bumped to 4.0.0-beta.8
    * @webda/versioning bumped to 4.0.0-beta.9
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.9

## [4.0.0-beta.8](https://github.com/loopingz/webda.io/compare/offline-v4.0.0-beta.7...offline-v4.0.0-beta.8) (2026-10-12)


### Features

* **offline:** encrypted local replica (EncryptedStorage, KeyProvider, passkey PRF) ([#881](https://github.com/loopingz/webda.io/issues/881)) ([db1eab7](https://github.com/loopingz/webda.io/commit/db1eab7a28214a81d33f2069c49721beb575f49c))


### Bug Fixes

* enable strict mode in hawk offline and test ([#873](https://github.com/loopingz/webda.io/issues/873)) ([79a83c9](https://github.com/loopingz/webda.io/commit/79a83c981b538176a77207e91d034e81c23478b7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.8
    * @webda/models bumped to 4.0.0-beta.8
    * @webda/ql bumped to 4.0.0-beta.7
    * @webda/versioning bumped to 4.0.0-beta.8
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.8
    * @webda/test bumped to 4.0.0-beta.7

## [4.0.0-beta.7](https://github.com/loopingz/webda.io/compare/offline-v4.0.0-beta.6...offline-v4.0.0-beta.7) (2026-10-11)


### Features

* **offline:** offline sync of models with conflict management (@webda/offline) ([#833](https://github.com/loopingz/webda.io/issues/833)) ([98df6ee](https://github.com/loopingz/webda.io/commit/98df6eeae0a17cdd984a6bc2c5a393543a58dcdf))


### Bug Fixes

* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.7
    * @webda/models bumped to 4.0.0-beta.7
    * @webda/versioning bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.7
