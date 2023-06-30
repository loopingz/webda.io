# Changelog

## [4.0.0](https://github.com/loopingz/webda.io/compare/websockets-v3.0.3...websockets-v4.0.0) (2023-06-30)


### ⚠ BREAKING CHANGES

* change canAct signature and create checkAct
* remove case insensitive for moddas
* remove node14 support

### Features

* add ref(..) to allow uid autocompletion ([de16cae](https://github.com/loopingz/webda.io/commit/de16cae506223322e4137b77b03afd4c84c22942))
* add reflections for CoreModel attributes ([7a17145](https://github.com/loopingz/webda.io/commit/7a17145f5b4495ee124931c79b77afee2031bdb7))
* add specific schema exporter for relations ([9b67109](https://github.com/loopingz/webda.io/commit/9b6710902168276e34a0c913080a1e749e758f37))
* add websockets module ([f10642d](https://github.com/loopingz/webda.io/commit/f10642d646ebef5b5ff1c62a87c4fb28fcabfef0))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* allow uievent optimization ([0bdc37a](https://github.com/loopingz/webda.io/commit/0bdc37a66d3ee1f9ca69f78acd2cabce246314a2))
* change canAct signature and create checkAct ([bf09a8b](https://github.com/loopingz/webda.io/commit/bf09a8bc8ff4248661d753e75310898fbc6544b1))
* remove case insensitive for moddas ([b7d3336](https://github.com/loopingz/webda.io/commit/b7d333632adeb037141d54da43701a1f34ee09f5))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))


### Bug Fixes

* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* websockets module compile ([f42ed4b](https://github.com/loopingz/webda.io/commit/f42ed4b55614068bb7b4a7efc9210ce22ca3714b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
  * devDependencies
    * @webda/shell bumped from ^3.1.0 to ^4.0.0
