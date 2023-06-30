# Changelog

## [4.0.0](https://github.com/loopingz/webda.io/compare/hawk-v3.0.3...hawk-v4.0.0) (2023-06-30)


### ⚠ BREAKING CHANGES

* change canAct signature and create checkAct
* use WebdaError instead of number for http code
* remove case insensitive for moddas
* remove node14 support

### Features

* add factory and permission query ([68ee7e9](https://github.com/loopingz/webda.io/commit/68ee7e92b0e0747b9ca1d796fcfb25919a5b58b2))
* add hawk ip whitelist ([171b699](https://github.com/loopingz/webda.io/commit/171b69925629aff9cf5ae304a93bc3597abbe153))
* add multiple increment to Store ([e6aea54](https://github.com/loopingz/webda.io/commit/e6aea54d2908e43816cd8043a0fdf209e5b04707))
* add Operations exporter code and configuration ([75ffd10](https://github.com/loopingz/webda.io/commit/75ffd1064a56f81f9df33e1babe5c10d31f2680f))
* add ProxyService ([c61a772](https://github.com/loopingz/webda.io/commit/c61a77284205c20bf12e305b6c7c88987ed62a43))
* add ref(..) to allow uid autocompletion ([de16cae](https://github.com/loopingz/webda.io/commit/de16cae506223322e4137b77b03afd4c84c22942))
* add reflections for CoreModel attributes ([7a17145](https://github.com/loopingz/webda.io/commit/7a17145f5b4495ee124931c79b77afee2031bdb7))
* add Registry and CryptoService and refactor SessionManagement ([852fe8b](https://github.com/loopingz/webda.io/commit/852fe8b076736530e18becc1479814d1cf03ccfc))
* add store advanced typing ([5670e4b](https://github.com/loopingz/webda.io/commit/5670e4b95fae9325dd60ad131e038eeea3c26a73))
* add websockets module ([f10642d](https://github.com/loopingz/webda.io/commit/f10642d646ebef5b5ff1c62a87c4fb28fcabfef0))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* change canAct signature and create checkAct ([bf09a8b](https://github.com/loopingz/webda.io/commit/bf09a8bc8ff4248661d753e75310898fbc6544b1))
* move to es module ([2234943](https://github.com/loopingz/webda.io/commit/22349431f8241fda7a10ecdeb6563a676b935320))
* remove case insensitive for moddas ([b7d3336](https://github.com/loopingz/webda.io/commit/b7d333632adeb037141d54da43701a1f34ee09f5))
* remove express and update way to manage request body ([38d8317](https://github.com/loopingz/webda.io/commit/38d8317566519d2a4f2fd47db56f7502219c13bb))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))
* use WebdaError instead of number for http code ([144f1f5](https://github.com/loopingz/webda.io/commit/144f1f510111048b3282524a2609c449c5bc5de7))


### Bug Fixes

* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* es test ([7959037](https://github.com/loopingz/webda.io/commit/79590378cb43fb15d8acd0e0eabf5cf972d41df5))
* hawk move to CORSFilter ([cc33c78](https://github.com/loopingz/webda.io/commit/cc33c7835d93ac8ef77af2e4cff706023ff5137e))
* hawk unit test ([5f2adc6](https://github.com/loopingz/webda.io/commit/5f2adc6a1d55bcac370f46b518148b90ac151efc))
* hawk unit test ([38027f7](https://github.com/loopingz/webda.io/commit/38027f762f7e52253210f5e47c6f1af0df0ca8c7))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* improve hawk management of vanished key ([952ca4c](https://github.com/loopingz/webda.io/commit/952ca4ce4ae66d67b4255fdeeaaaa8fd1a5e1303))
* move unit test to checkCORSFilter ([55390fb](https://github.com/loopingz/webda.io/commit/55390fb3de642581f61e7f0915e6cdace04cf13f))
* multi-headers management ([1f9fb7d](https://github.com/loopingz/webda.io/commit/1f9fb7d1cb2f10b4a348ecaac95f66d3b850e8bc))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))
* remove unreachable code ([2f49e55](https://github.com/loopingz/webda.io/commit/2f49e5517e232b981b85a06ed8a9d7a54d3fb169))
* unit test and coverage ([25a5160](https://github.com/loopingz/webda.io/commit/25a5160c64592a45575460d317725ac835a6aa98))
* use getHostname of context on hawk ([162c1d6](https://github.com/loopingz/webda.io/commit/162c1d6e4bb8994fd20f4e128da948ecedd6587d))
* use process singleton for beans declaration ([6f93c6c](https://github.com/loopingz/webda.io/commit/6f93c6cb04676e53a80252ce3963607a42dc2aa1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
  * devDependencies
    * @webda/shell bumped from ^3.1.0 to ^4.0.0
