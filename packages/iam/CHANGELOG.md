# Changelog

## [4.0.0-beta.7](https://github.com/loopingz/webda.io/compare/iam-v4.0.0-beta.6...iam-v4.0.0-beta.7) (2026-10-10)


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
