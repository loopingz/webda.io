# Changelog

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/iam-v4.0.0-beta.12...iam-v4.0.0-beta.13) (2026-10-31)


### Features

* **core:** GlobalOperationContext and useSystem() for system operation calls ([#1003](https://github.com/loopingz/webda.io/issues/1003)) ([b5dc9ef](https://github.com/loopingz/webda.io/commit/b5dc9ef86ce6213c27e186867bdd4b7ba9c323df))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9

## [4.0.0-beta.12](https://github.com/loopingz/webda.io/compare/iam-v4.0.0-beta.11...iam-v4.0.0-beta.12) (2026-10-22)


### Bug Fixes

* **content-mapper:** list Events of an optional [WEBDA_EVENTS]? member under strict ([#978](https://github.com/loopingz/webda.io/issues/978)) ([c303962](https://github.com/loopingz/webda.io/commit/c30396298c8545f9c1ff5d8c4839191afbd7609f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.12
    * @webda/models bumped to 4.0.0-beta.12
    * @webda/utils bumped to 4.0.0-beta.11
    * @webda/workout bumped to 4.0.0-beta.6
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.12
    * @webda/test bumped to 4.0.0-beta.8

## [4.0.0-beta.11](https://github.com/loopingz/webda.io/compare/iam-v4.0.0-beta.10...iam-v4.0.0-beta.11) (2026-10-16)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.11
    * @webda/models bumped to 4.0.0-beta.11
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.11

## [4.0.0-beta.10](https://github.com/loopingz/webda.io/compare/iam-v4.0.0-beta.9...iam-v4.0.0-beta.10) (2026-10-15)


### Features

* delegated OAuth 2.1 tokens with operation-level consent ([#928](https://github.com/loopingz/webda.io/issues/928)) ([44709d6](https://github.com/loopingz/webda.io/commit/44709d6adea6a7e346ada3bb7bd309ef3d9a54e0))
* **oidc:** @webda/oidc workload identity and trust between applications ([#832](https://github.com/loopingz/webda.io/issues/832)) ([#896](https://github.com/loopingz/webda.io/issues/896)) ([51719bf](https://github.com/loopingz/webda.io/commit/51719bf07b9abcc798c9191c385c4e11365561d4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.10
    * @webda/models bumped to 4.0.0-beta.10
    * @webda/utils bumped to 4.0.0-beta.10
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.10

## [4.0.0-beta.9](https://github.com/loopingz/webda.io/compare/iam-v4.0.0-beta.8...iam-v4.0.0-beta.9) (2026-10-14)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.9
    * @webda/models bumped to 4.0.0-beta.9
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.9

## [4.0.0-beta.8](https://github.com/loopingz/webda.io/compare/iam-v4.0.0-beta.7...iam-v4.0.0-beta.8) (2026-10-12)


### Bug Fixes

* enable strict mode in ten small packages ([#872](https://github.com/loopingz/webda.io/issues/872)) ([ecad571](https://github.com/loopingz/webda.io/commit/ecad571d67963ea4c35b47ddfafc1b91c2d7b12f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.8
    * @webda/models bumped to 4.0.0-beta.8
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.8
    * @webda/test bumped to 4.0.0-beta.7

## [4.0.0-beta.7](https://github.com/loopingz/webda.io/compare/iam-v4.0.0-beta.6...iam-v4.0.0-beta.7) (2026-10-11)


### ⚠ BREAKING CHANGES

* **iam:** canCallOperation() from @webda/core now returns Promise<boolean> so awaited operation authorizers can run. Callers must await it: a non-awaited Promise is truthy and would allow every operation.

### Features

* **iam:** IAM policies for operations, evaluated with Casbin ([#830](https://github.com/loopingz/webda.io/issues/830)) ([32a84db](https://github.com/loopingz/webda.io/commit/32a84dbbe7b534ecba557fff4c4b6e3ea172ea9b))
* model Behaviors v1 ([#765](https://github.com/loopingz/webda.io/issues/765)) ([5053245](https://github.com/loopingz/webda.io/commit/5053245440a60318f06fb9aecacf8113c31262a8))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))


### Bug Fixes

* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.7
    * @webda/models bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.7
