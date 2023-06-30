# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.1.0](https://github.com/loopingz/webda.io/compare/shell-v3.0.2...shell-v3.1.0) (2023-06-30)


### Features

* add smart compilation for webda binary ([48e17ed](https://github.com/loopingz/webda.io/commit/48e17eda613b171ccb240950e167fe3c806ee78f)), closes [#402](https://github.com/loopingz/webda.io/issues/402)
* add WS proxy system ([fdc394d](https://github.com/loopingz/webda.io/commit/fdc394de666d74e9130d29fb6d4ddd67b650430f))
* allow redirect with WebdaError.Redirect ([499432e](https://github.com/loopingz/webda.io/commit/499432edd2bc9b542d7551b398a8b32648f04c4e))
* allow usage of lowercase log level ([6e8efdb](https://github.com/loopingz/webda.io/commit/6e8efdbbdfee1cbe1bcb04e9daf17a4aab89ae1f))
* emit a Webda.Init.Http when http server is ready ([5513a21](https://github.com/loopingz/webda.io/commit/5513a214ed46ab7cf43ce0ae8e364e72a1333725))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* add missing dependencies ([189863f](https://github.com/loopingz/webda.io/commit/189863fcd18f27295eb4630febe7cf852dcc12e8))
* add missing dependencies for pnpm/bazel ([1ec04a3](https://github.com/loopingz/webda.io/commit/1ec04a375998ee7a7a00ea03c30a2960b7778d6b))
* improve error message for unsupported diagrams ([03238b0](https://github.com/loopingz/webda.io/commit/03238b072ad3525ed463212fc77463f958259f90))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.0.2 to ^3.1.0
    * @webda/kubernetes bumped from ^3.0.2 to ^3.0.3
    * @webda/tsc-esm bumped from ^1.0.3 to ^1.0.4
    * @webda/workout bumped from ^3.0.0 to ^3.0.1

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
