# Changelog

## [4.0.0-beta.15](https://github.com/loopingz/webda.io/compare/sealed-client-v4.0.0-beta.14...sealed-client-v4.0.0-beta.15) (2026-11-14)


### Performance Improvements

* cache compiler queries and git information, stop the file configuration watcher ([#1066](https://github.com/loopingz/webda.io/issues/1066)) ([93d432f](https://github.com/loopingz/webda.io/commit/93d432fc1e040a701433d53db560b8b6ff7e4c4c))
* **core:** map routes lazily and speed up the slowest unit tests ([#1065](https://github.com/loopingz/webda.io/issues/1065)) ([c0babaa](https://github.com/loopingz/webda.io/commit/c0babaaa1f9fa8be8c2fa65bb8794d297c41bea3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.15

## [4.0.0-beta.14](https://github.com/loopingz/webda.io/compare/sealed-client-v4.0.0-beta.13...sealed-client-v4.0.0-beta.14) (2026-11-10)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.14

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/sealed-client-v4.0.0-beta.12...sealed-client-v4.0.0-beta.13) (2026-11-04)


### ⚠ BREAKING CHANGES

* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996))

### Features

* **auth:** store the password escrow with the password change ([#1018](https://github.com/loopingz/webda.io/issues/1018)) ([712e1ef](https://github.com/loopingz/webda.io/commit/712e1ef5abe616b50062c37529fa7613428ce4c1))
* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996)) ([d9ddb34](https://github.com/loopingz/webda.io/commit/d9ddb34f2ec01bece5c4ca64631e14fe6d3d6264))
* **sealed:** offline decrypt-on-read, sealed-field query warning, escrow kid precondition, set size cap ([#1022](https://github.com/loopingz/webda.io/issues/1022)) ([5be9b53](https://github.com/loopingz/webda.io/commit/5be9b53aafacda210eda0163158273444d5c471a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13

## [4.0.0-beta.12](https://github.com/loopingz/webda.io/compare/sealed-client-v4.0.0-beta.11...sealed-client-v4.0.0-beta.12) (2026-10-22)


### Features

* end-to-end encrypted model fields (SealedField, UserKeys, @webda/sealed-client) ([#941](https://github.com/loopingz/webda.io/issues/941)) ([fbc5bd2](https://github.com/loopingz/webda.io/commit/fbc5bd24b1f60c87c53c33f9d1650634834c894e))


### Bug Fixes

* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.12
