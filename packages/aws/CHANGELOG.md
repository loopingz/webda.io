# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.1.1](https://github.com/loopingz/webda.io/compare/aws-v3.1.0...aws-v3.1.1) (2023-06-30)


### Bug Fixes

* add explicit dependencies declaration ([#411](https://github.com/loopingz/webda.io/issues/411)) ([4d8cbae](https://github.com/loopingz/webda.io/commit/4d8cbae4d6d31b62df98832591bc97ca77ae6a69))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^3.1.1
    * @webda/workout bumped from ^3.0.1 to ^3.0.2
  * devDependencies
    * @webda/async bumped from ^3.0.3 to ^3.0.4
    * @webda/shell bumped from ^3.1.0 to ^3.1.1

## [3.1.0](https://github.com/loopingz/webda.io/compare/aws-v3.0.2...aws-v3.1.0) (2023-06-30)


### Features

* allow redirect with WebdaError.Redirect ([499432e](https://github.com/loopingz/webda.io/commit/499432edd2bc9b542d7551b398a8b32648f04c4e))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* improve error message for unsupported diagrams ([03238b0](https://github.com/loopingz/webda.io/commit/03238b072ad3525ed463212fc77463f958259f90))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.0.2 to ^3.1.0
  * devDependencies
    * @webda/async bumped from ^3.0.2 to ^3.0.3
    * @webda/shell bumped from ^3.0.2 to ^3.1.0

## [1.1.1](https://github.com/loopingz/webda.io/compare/@webda/aws@1.1.0...@webda/aws@1.1.1) (2021-03-24)

**Note:** Version bump only for package @webda/aws





# [1.1.0](https://github.com/loopingz/webda.io/compare/@webda/aws@1.0.0...@webda/aws@1.1.0) (2021-03-18)


### Bug Fixes

* add deploy stage for existing resources ([7233190](https://github.com/loopingz/webda.io/commit/72331900f43742482bd5e9de926a78e3e027d7b8))


### Features

* allow to send the request id to the api client ([9b2fd11](https://github.com/loopingz/webda.io/commit/9b2fd111882abc5ed38f2fb651159c58c960a887))





# 1.0.0-beta.0 (2019-08-21)


### Bug Fixes

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
