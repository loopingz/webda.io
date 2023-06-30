# Changelog

## [4.0.0](https://github.com/loopingz/webda.io/compare/google-auth-v3.0.3...google-auth-v4.0.0) (2023-06-30)


### ⚠ BREAKING CHANGES

* use WebdaError instead of number for http code
* remove case insensitive for moddas
* remove node14 support

### Features

* add Operations exporter code and configuration ([75ffd10](https://github.com/loopingz/webda.io/commit/75ffd1064a56f81f9df33e1babe5c10d31f2680f))
* add ProxyService ([c61a772](https://github.com/loopingz/webda.io/commit/c61a77284205c20bf12e305b6c7c88987ed62a43))
* add ref(..) to allow uid autocompletion ([de16cae](https://github.com/loopingz/webda.io/commit/de16cae506223322e4137b77b03afd4c84c22942))
* add reflections for CoreModel attributes ([7a17145](https://github.com/loopingz/webda.io/commit/7a17145f5b4495ee124931c79b77afee2031bdb7))
* add Registry and CryptoService and refactor SessionManagement ([852fe8b](https://github.com/loopingz/webda.io/commit/852fe8b076736530e18becc1479814d1cf03ccfc))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* move to es module ([2234943](https://github.com/loopingz/webda.io/commit/22349431f8241fda7a10ecdeb6563a676b935320))
* remove case insensitive for moddas ([b7d3336](https://github.com/loopingz/webda.io/commit/b7d333632adeb037141d54da43701a1f34ee09f5))
* remove express and update way to manage request body ([38d8317](https://github.com/loopingz/webda.io/commit/38d8317566519d2a4f2fd47db56f7502219c13bb))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))
* use WebdaError instead of number for http code ([144f1f5](https://github.com/loopingz/webda.io/commit/144f1f510111048b3282524a2609c449c5bc5de7))


### Bug Fixes

* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* amqp unit tests ([8d0ca6d](https://github.com/loopingz/webda.io/commit/8d0ca6dbd9e5c6a9331c3dda439788aff0701650))
* avoid error if oauth state is not present ([70df927](https://github.com/loopingz/webda.io/commit/70df927e3cd45a33be3d7782431ad978050e921e))
* FileBinary folder ([eff3469](https://github.com/loopingz/webda.io/commit/eff346975968e64304e90e9d59e286e2dba53642))
* gcp/google-auth/elasticsearch unit tests ([7fc2cd1](https://github.com/loopingz/webda.io/commit/7fc2cd18cfa44fff83900afb03588454b2110983))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* improve hawk management of vanished key ([952ca4c](https://github.com/loopingz/webda.io/commit/952ca4ce4ae66d67b4255fdeeaaaa8fd1a5e1303))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))
* remove unreachable code ([2f49e55](https://github.com/loopingz/webda.io/commit/2f49e5517e232b981b85a06ed8a9d7a54d3fb169))
* router weird behavior on query string ([9421e7d](https://github.com/loopingz/webda.io/commit/9421e7d0d29f0551c9674d9367f542ed07b21cfd))
* unit test and coverage ([25a5160](https://github.com/loopingz/webda.io/commit/25a5160c64592a45575460d317725ac835a6aa98))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
  * devDependencies
    * @webda/shell bumped from ^3.1.0 to ^4.0.0
