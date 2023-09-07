# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.1.0](https://github.com/loopingz/webda.io/compare/@webda/core@1.0.1...@webda/core@1.1.0) (2021-03-24)


### Bug Fixes

* cookie split with longer parameters than 96 characters (Close [#28](https://github.com/loopingz/webda.io/issues/28)) ([9a27bb4](https://github.com/loopingz/webda.io/commit/9a27bb413eb4bab2e8de9b446746ebf93800e21a))


### Features

* add YAMLUtils to simplify library (Close [#26](https://github.com/loopingz/webda.io/issues/26)) ([1105eec](https://github.com/loopingz/webda.io/commit/1105eec6f44aad503262b7af844874b6be00712b))





## [3.4.0](https://github.com/loopingz/webda.io/compare/core-v3.3.0...core-v3.4.0) (2023-09-07)


### Features

* add swagger-ui for dev ([a6adb77](https://github.com/loopingz/webda.io/commit/a6adb77fcfb38c6e6398d2404a9351d8871a0dc9))


### Bug Fixes

* DomainService collection query ([6f81d7c](https://github.com/loopingz/webda.io/commit/6f81d7c10ab2d554c3c309fdca4063b3db83c2f1))
* query parameters on collection for DomainService ([ef6d18d](https://github.com/loopingz/webda.io/commit/ef6d18d8283d789fceb278d1a969eb49db061d0b))
* query SubExpression only ([36bccd7](https://github.com/loopingz/webda.io/commit/36bccd7992f4260a6f27ad15388f5f0c320d4dec))

## [3.3.0](https://github.com/loopingz/webda.io/compare/core-v3.2.2...core-v3.3.0) (2023-08-30)


### Features

* allow no domain on cookie to default on domain only ([308fa49](https://github.com/loopingz/webda.io/commit/308fa493e3f2e813d919f1375839302512eb7969))


### Bug Fixes

* beans local configuration without config declaration ([5186555](https://github.com/loopingz/webda.io/commit/5186555a5d5318e750ea585ca90ea693a41db47e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped from ^3.0.2 to ^3.0.3
  * devDependencies
    * @webda/tsc-esm bumped from ^1.0.5 to ^1.0.6

## [3.2.2](https://github.com/loopingz/webda.io/compare/core-v3.2.1...core-v3.2.2) (2023-07-19)


### Bug Fixes

* allow no resolution for symlink to fix aspect_build_js all symlink ([a6a97ad](https://github.com/loopingz/webda.io/commit/a6a97ad4ada88b83b8c32ab2ef40e6482944b333))
* make values optional to allow downward compatibility ([c0fec4f](https://github.com/loopingz/webda.io/commit/c0fec4fb21dba5e6c97f3ff87e15bf0abf2334bc))

## [3.2.1](https://github.com/loopingz/webda.io/compare/core-v3.2.0...core-v3.2.1) (2023-07-08)


### Bug Fixes

* keep symlink path with folder symlinked ([bd3d7b5](https://github.com/loopingz/webda.io/commit/bd3d7b59d4a22d3e5e26b24532214ee62505098a))
* relax version condition between @webda/shell and @webda/core ([b634574](https://github.com/loopingz/webda.io/commit/b6345743ea5ea0ef66615d7e1ae3bca4c8610122))

## [3.2.0](https://github.com/loopingz/webda.io/compare/core-v3.1.2...core-v3.2.0) (2023-07-07)


### Features

* add a Webda.UpdateContextRoute to be able to alter router decision ([22463f9](https://github.com/loopingz/webda.io/commit/22463f9b12a25cbee124184df0243d8ab7bf706d))
* add regexp validator utility classes ([b71f1ca](https://github.com/loopingz/webda.io/commit/b71f1ca37ac3602675de21341ac843833d6eaf63))


### Bug Fixes

* ignore any .folder in node_modules for pnpm and nx ([ebe7f81](https://github.com/loopingz/webda.io/commit/ebe7f81e19d27f5a8bed27e040a18c2925fe5e27))

## [3.1.2](https://github.com/loopingz/webda.io/compare/core-v3.1.1...core-v3.1.2) (2023-07-01)


### Bug Fixes

* allow to specify a machine id ([#413](https://github.com/loopingz/webda.io/issues/413)) ([fa24d8e](https://github.com/loopingz/webda.io/commit/fa24d8ec00340903e180ba16dc7dbf5765430d21))

## [3.1.1](https://github.com/loopingz/webda.io/compare/core-v3.1.0...core-v3.1.1) (2023-06-30)


### Bug Fixes

* add explicit dependencies declaration ([#411](https://github.com/loopingz/webda.io/issues/411)) ([4d8cbae](https://github.com/loopingz/webda.io/commit/4d8cbae4d6d31b62df98832591bc97ca77ae6a69))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped from ^3.0.1 to ^3.0.2
  * devDependencies
    * @webda/tsc-esm bumped from ^1.0.4 to ^1.0.5

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
