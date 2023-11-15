# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.1.0](https://github.com/loopingz/webda.io/compare/@webda/core@1.0.1...@webda/core@1.1.0) (2021-03-24)


### Bug Fixes

* cookie split with longer parameters than 96 characters (Close [#28](https://github.com/loopingz/webda.io/issues/28)) ([9a27bb4](https://github.com/loopingz/webda.io/commit/9a27bb413eb4bab2e8de9b446746ebf93800e21a))


### Features

* add YAMLUtils to simplify library (Close [#26](https://github.com/loopingz/webda.io/issues/26)) ([1105eec](https://github.com/loopingz/webda.io/commit/1105eec6f44aad503262b7af844874b6be00712b))





## [3.8.1](https://github.com/loopingz/webda.io/compare/core-v3.8.0...core-v3.8.1) (2023-11-15)


### Bug Fixes

* getGraph case insensitive ([a35ea49](https://github.com/loopingz/webda.io/commit/a35ea49ad5f0e676f0c483ae2a23ab90fe0c4315))

## [3.8.0](https://github.com/loopingz/webda.io/compare/core-v3.7.0...core-v3.8.0) (2023-11-14)


### Features

* add otel module ([1841c28](https://github.com/loopingz/webda.io/commit/1841c28ab6225f6e2df3068f6869f1487b470d52))

## [3.7.0](https://github.com/loopingz/webda.io/compare/core-v3.6.0...core-v3.7.0) (2023-11-12)


### Features

* add an isEmpty method for Binary ([daf5832](https://github.com/loopingz/webda.io/commit/daf5832f4ca8b867eff1669e455f9761f1a15834))
* add CoreModel listeners system ([977dd9d](https://github.com/loopingz/webda.io/commit/977dd9d8a04f5b3e6d19f09f8755277b26242a18))
* add execute/wait method to Throttler ([b6cd66b](https://github.com/loopingz/webda.io/commit/b6cd66b49cc051f1eec085542fa4cf76f822f19f))
* add iterate generator methods ([ff45183](https://github.com/loopingz/webda.io/commit/ff45183625bdce480f396f88f594fe196415d3da))
* drop node16 as it is EOL ([a6b795a](https://github.com/loopingz/webda.io/commit/a6b795a76e5089a0cf81269c49e00131bc17c1a9))
* modelmapper service ([e5eee5f](https://github.com/loopingz/webda.io/commit/e5eee5f9c79f513a6bd9efe2e464c4491ac6924b))
* RESTDomainService: add the url info retriever on Binaries ([13fe77c](https://github.com/loopingz/webda.io/commit/13fe77ccd0082432ea79ec9b7c32ac261cebeb01))
* Store: add additionalModels to compose models in store ([e0f1d69](https://github.com/loopingz/webda.io/commit/e0f1d69c7a1302c9df1ea2fa365e422b141c0d89))
* Throttler add a static method ([dd5178e](https://github.com/loopingz/webda.io/commit/dd5178e385bd970ab0e36a6f4ecb6dd63b438bc2))


### Bug Fixes

* BinaryFile: fallback on originalname if name is not present ([245a24b](https://github.com/loopingz/webda.io/commit/245a24b97963d51c2b5085fa29c5b54e40bf46d4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped from ^3.0.4 to ^3.1.0
  * devDependencies
    * @webda/tsc-esm bumped from ^1.0.6 to ^1.1.0

## [3.6.0](https://github.com/loopingz/webda.io/compare/core-v3.5.0...core-v3.6.0) (2023-10-07)


### Features

* add isGlobal to Context ([6423ba7](https://github.com/loopingz/webda.io/commit/6423ba7a23e96c6132ca468074e5e6fdd66d71ce))
* add stop function for service ([c4fb0ec](https://github.com/loopingz/webda.io/commit/c4fb0ec6cc1b1ee49105193cedad32538742113a))
* allow context propagation in linked model ([e84df9a](https://github.com/loopingz/webda.io/commit/e84df9a7435db40d56d498b624d5f71e9f2d0ebe))


### Bug Fixes

* display help command ([3d0b790](https://github.com/loopingz/webda.io/commit/3d0b79090f1fc23e3d02a7e7b0c3ce023f85f586))
* domainservice model actions ([48a899a](https://github.com/loopingz/webda.io/commit/48a899adac3c81a611702defccee4871a7941df7))
* remove completely the _ prefix of action method ([3530b60](https://github.com/loopingz/webda.io/commit/3530b60fe51ee3f913b71801009dbace2b68188d))
* setContext on undefined reference ([030db1b](https://github.com/loopingz/webda.io/commit/030db1bc6166a8d18248d304b6bf3bf988e8a9f7))
* write on flushed header ([2d1ef2e](https://github.com/loopingz/webda.io/commit/2d1ef2e59d3809e5c1dbe82b5312e31fb2015eca))

## [3.5.0](https://github.com/loopingz/webda.io/compare/core-v3.4.0...core-v3.5.0) (2023-10-04)


### Features

* add absolute url when prefix is in use for Router ([8ea07f7](https://github.com/loopingz/webda.io/commit/8ea07f7f66a09ebf95a79a9edea2cef2dc399128))
* add more cases to transformName for RESTDomainService ([b1071f2](https://github.com/loopingz/webda.io/commit/b1071f20157932ccbd4e0150791300f624a6e25c))
* ensure YAMLUtils.parse can handle multiple documents ([11061f9](https://github.com/loopingz/webda.io/commit/11061f92c0e91e8c80f92027392942eb0ed2b810))


### Bug Fixes

* . route on / url service ([426ec2a](https://github.com/loopingz/webda.io/commit/426ec2a386ca409c581827a294e11af09536cf65))
* default toLowerCase for k8s resources name ([aaa0d58](https://github.com/loopingz/webda.io/commit/aaa0d5844f12532d2eb3a5813968a730deb4d4d0))
* display of double import warning ([c55f2d8](https://github.com/loopingz/webda.io/commit/c55f2d83f75143a24a6af2035d82b6c593e0014f))
* ensure a / exists before root collection for RESTDomainService ([555782e](https://github.com/loopingz/webda.io/commit/555782e4c8bd5f2a43cff4e7ee447a64e2982cd1))
* machineIdSync catch error ([7a29f5c](https://github.com/loopingz/webda.io/commit/7a29f5c548e4db50f3bebc5b8e248ddfaf485dad))
* set devMode prior to initialization ([cb62746](https://github.com/loopingz/webda.io/commit/cb627464a23c9f0741a2353654f30b700676823c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped from ^3.0.3 to ^3.0.4

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
