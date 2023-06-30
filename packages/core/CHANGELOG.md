# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.1.0](https://github.com/loopingz/webda.io/compare/@webda/core@1.0.1...@webda/core@1.1.0) (2021-03-24)


### Bug Fixes

* cookie split with longer parameters than 96 characters (Close [#28](https://github.com/loopingz/webda.io/issues/28)) ([9a27bb4](https://github.com/loopingz/webda.io/commit/9a27bb413eb4bab2e8de9b446746ebf93800e21a))


### Features

* add YAMLUtils to simplify library (Close [#26](https://github.com/loopingz/webda.io/issues/26)) ([1105eec](https://github.com/loopingz/webda.io/commit/1105eec6f44aad503262b7af844874b6be00712b))





## [3.1.0](https://github.com/loopingz/webda.io/compare/core-v3.0.2...core-v3.1.0) (2023-06-30)


### Features

* add WS proxy system ([fdc394d](https://github.com/loopingz/webda.io/commit/fdc394de666d74e9130d29fb6d4ddd67b650430f))
* allow usage of lowercase log level ([6e8efdb](https://github.com/loopingz/webda.io/commit/6e8efdbbdfee1cbe1bcb04e9daf17a4aab89ae1f))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* force file format with JSON/YAMLUtils.saveFile ([d629ad6](https://github.com/loopingz/webda.io/commit/d629ad6ac62ae059cdec9700a48813d489316325))
* improve error message for unsupported diagrams ([03238b0](https://github.com/loopingz/webda.io/commit/03238b072ad3525ed463212fc77463f958259f90))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped from ^3.0.0 to ^3.0.1
  * devDependencies
    * @webda/tsc-esm bumped from ^1.0.3 to ^1.0.4

## [1.0.1](https://github.com/loopingz/webda.io/compare/@webda/core@1.0.0...@webda/core@1.0.1) (2021-03-18)

**Note:** Version bump only for package @webda/core





# 1.0.0-beta.0 (2019-08-21)


### Bug Fixes

* code smell ([af4f211](https://github.com/loopingz/webda/commit/af4f211))
* move away from checkCSRF to checkRequest ([84a9265](https://github.com/loopingz/webda/commit/84a9265))
* resolved routes issue within test ([62b41f2](https://github.com/loopingz/webda/commit/62b41f2))
* update all packages to use the new scope [@webda](https://github.com/webda) ([6acc1d5](https://github.com/loopingz/webda/commit/6acc1d5))
* update imports ([7896f0c](https://github.com/loopingz/webda/commit/7896f0c))


### Features

* new versioning system ([27ab549](https://github.com/loopingz/webda/commit/27ab549))


### BREAKING CHANGES

* need to update as CorsFilter is not exported anymore
* new v1.0.0
