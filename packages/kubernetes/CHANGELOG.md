# Changelog

## [4.0.0](https://github.com/loopingz/webda.io/compare/kubernetes-v3.0.3...kubernetes-v4.0.0) (2023-06-30)


### ⚠ BREAKING CHANGES

* remove case insensitive for moddas
* remove node14 support

### Features

* add a Cron exporter shell for @webda/kubernetes ([7a349a4](https://github.com/loopingz/webda.io/commit/7a349a430fe8dfd8a3cc3491cac00c41dc97c362))
* add args spreader for cron commandline ([2a972e2](https://github.com/loopingz/webda.io/commit/2a972e2afd6acb024ea43dd7fe3852f024ce9abf))
* add cron replacement ([3e7d872](https://github.com/loopingz/webda.io/commit/3e7d872d237e7ccb61f62e5045231d0ad995702e))
* add env variable replacement to job customization ([f864e6b](https://github.com/loopingz/webda.io/commit/f864e6b87074db25d14037a5a1a6d667a0c0c13d))
* add Operations exporter code and configuration ([75ffd10](https://github.com/loopingz/webda.io/commit/75ffd1064a56f81f9df33e1babe5c10d31f2680f))
* add ProxyService ([c61a772](https://github.com/loopingz/webda.io/commit/c61a77284205c20bf12e305b6c7c88987ed62a43))
* add reflections for CoreModel attributes ([7a17145](https://github.com/loopingz/webda.io/commit/7a17145f5b4495ee124931c79b77afee2031bdb7))
* add Registry and CryptoService and refactor SessionManagement ([852fe8b](https://github.com/loopingz/webda.io/commit/852fe8b076736530e18becc1479814d1cf03ccfc))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* move to es module ([2234943](https://github.com/loopingz/webda.io/commit/22349431f8241fda7a10ecdeb6563a676b935320))
* remove case insensitive for moddas ([b7d3336](https://github.com/loopingz/webda.io/commit/b7d333632adeb037141d54da43701a1f34ee09f5))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* core unit tests ([cddb5c4](https://github.com/loopingz/webda.io/commit/cddb5c480057020651f3e4e4337396c979b83ca7))
* do not reload on cachedModule ([5add438](https://github.com/loopingz/webda.io/commit/5add438d5b9a4d28dcdca172e721fa0d7949bfc2))
* elasticsearch 8.x ([79d4750](https://github.com/loopingz/webda.io/commit/79d4750f9490ac0ee0923e6fcc00493ed3815981))
* FileBinary folder ([eff3469](https://github.com/loopingz/webda.io/commit/eff346975968e64304e90e9d59e286e2dba53642))
* gcp/google-auth/elasticsearch unit tests ([7fc2cd1](https://github.com/loopingz/webda.io/commit/7fc2cd18cfa44fff83900afb03588454b2110983))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* improve error message for unsupported diagrams ([03238b0](https://github.com/loopingz/webda.io/commit/03238b072ad3525ed463212fc77463f958259f90))
* kubernetes fs-extra not ESM compatible ([745800e](https://github.com/loopingz/webda.io/commit/745800e4f37f5553cca9822065e76a4e6e7bbc84))
* **kubernetes:** add argsLine for cron exporter ([77ab8a7](https://github.com/loopingz/webda.io/commit/77ab8a72474e470a3c5e769049f01c01a10bce6c))
* **shell:** json-schema generation post update 1.1 ([fb2e6ca](https://github.com/loopingz/webda.io/commit/fb2e6ca55ff5e744561082096cfdd82782b4cb1c))
* update module jsons ([5556aa5](https://github.com/loopingz/webda.io/commit/5556aa5c33ff458ee3bd4e07f32c6a5dae430c8b))
* use enhanced cron with cronId ([978f12d](https://github.com/loopingz/webda.io/commit/978f12dc3349eeada91afbc22bb23afdfafff38a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/async bumped from ^3.0.3 to ^4.0.0
    * @webda/core bumped from ^3.1.0 to ^4.0.0

## [3.0.3](https://github.com/loopingz/webda.io/compare/kubernetes-v3.0.2...kubernetes-v3.0.3) (2023-06-30)


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* improve error message for unsupported diagrams ([03238b0](https://github.com/loopingz/webda.io/commit/03238b072ad3525ed463212fc77463f958259f90))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/async bumped from ^3.0.2 to ^3.0.3
    * @webda/core bumped from ^3.0.2 to ^3.1.0
