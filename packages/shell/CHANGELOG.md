# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.2](https://github.com/loopingz/webda.io/compare/@webda/shell@1.0.1...@webda/shell@1.0.2) (2021-03-24)


### Bug Fixes

* scan dependency specific versions ([#27](https://github.com/loopingz/webda.io/issues/27)) ([c75a18f](https://github.com/loopingz/webda.io/commit/c75a18f31523198679bc7cf00581f13c265d141b))





## [1.0.1](https://github.com/loopingz/webda.io/compare/@webda/shell@1.0.0...@webda/shell@1.0.1) (2021-03-18)


### Bug Fixes

* add .zip if missing for packager ([072ca64](https://github.com/loopingz/webda.io/commit/072ca6433640673708fbcaf67e9bf8bbecd06c71))
* avoid failing if includeWorkspaces is used without workspace ([187665e](https://github.com/loopingz/webda.io/commit/187665e7628d1e22cc04ba2108cdc0d69a87fbe9))





# 1.0.0-beta.0 (2019-08-21)


### Bug Fixes

* **shell:** use local webda when available ([a02f3ff](https://github.com/loopingz/webda.io/commit/a02f3ff))
* @webda/shell import for @webda/core ([d3eca0f](https://github.com/loopingz/webda.io/commit/d3eca0f))
* move away from checkCSRF to checkRequest ([84a9265](https://github.com/loopingz/webda.io/commit/84a9265))
* remove x-webda-method header ([ac0e798](https://github.com/loopingz/webda.io/commit/ac0e798))
* update all packages to use the new scope [@webda](https://github.com/webda) ([6acc1d5](https://github.com/loopingz/webda.io/commit/6acc1d5))
* update imports ([7896f0c](https://github.com/loopingz/webda.io/commit/7896f0c))


### Features

* new versioning system ([27ab549](https://github.com/loopingz/webda.io/commit/27ab549))


### BREAKING CHANGES

* remove the compatibility for PUT instead of PATCH
* need to update as CorsFilter is not exported anymore
* new v1.0.0
