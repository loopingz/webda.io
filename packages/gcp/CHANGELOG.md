# Changelog

## [4.0.0](https://github.com/loopingz/webda.io/compare/gcp-v3.1.0...gcp-v4.0.0) (2023-06-30)


### ⚠ BREAKING CHANGES

* simplify configuration services by removing the webda node
* remove dynamic lastUpdate and creationDate
* change canAct signature and create checkAct
* remove obsolete methods
* remove case insensitive for moddas
* remove node14 support

### Features

* add a Cron exporter shell for @webda/kubernetes ([7a349a4](https://github.com/loopingz/webda.io/commit/7a349a430fe8dfd8a3cc3491cac00c41dc97c362))
* add alias store and queryAll method ([fe3ae81](https://github.com/loopingz/webda.io/commit/fe3ae81a1863d9498de51ff4a7ee54b6e399ef91))
* add an option to validate without required for schema ([b0913de](https://github.com/loopingz/webda.io/commit/b0913deb327e8e30edaf9dca85366ae35d5acdbf))
* add binary routes on DomainService ([6aadb04](https://github.com/loopingz/webda.io/commit/6aadb043fc51f88c0fa37e157f7af56177160254))
* add binary/binaries attribute mapper ([c10be30](https://github.com/loopingz/webda.io/commit/c10be30bb8a878bc70a108d06e359978f887a539))
* add CONTAINS operator for WebdaQL ([836093f](https://github.com/loopingz/webda.io/commit/836093f951a65dbd3d3f41443e2babea0ed7f3d9))
* add generic way to get the types for a model ([bb163e3](https://github.com/loopingz/webda.io/commit/bb163e3db7d5754c1ce457ddb930585e33e0a1a2))
* add multiple increment to Store ([e6aea54](https://github.com/loopingz/webda.io/commit/e6aea54d2908e43816cd8043a0fdf209e5b04707))
* add OperationContext ([bad48b4](https://github.com/loopingz/webda.io/commit/bad48b4843c5c228acfa6474b12a9b03b047ec41))
* add Operations exporter code and configuration ([75ffd10](https://github.com/loopingz/webda.io/commit/75ffd1064a56f81f9df33e1babe5c10d31f2680f))
* add ORDER BY clause ([5ae1cc0](https://github.com/loopingz/webda.io/commit/5ae1cc0688cc86d8aa294088f03980543a4d81d7))
* add Proxy on CoreModel ([845c7b9](https://github.com/loopingz/webda.io/commit/845c7b91d6704ed07cb17a8ee17ac50878b9880c))
* add ProxyService ([c61a772](https://github.com/loopingz/webda.io/commit/c61a77284205c20bf12e305b6c7c88987ed62a43))
* add putRedirectUrl for Google Storage ([ec03b09](https://github.com/loopingz/webda.io/commit/ec03b0900bff3ed6208abd4e358f401d08657131))
* add ref(..) to allow uid autocompletion ([de16cae](https://github.com/loopingz/webda.io/commit/de16cae506223322e4137b77b03afd4c84c22942))
* add reflections for CoreModel attributes ([7a17145](https://github.com/loopingz/webda.io/commit/7a17145f5b4495ee124931c79b77afee2031bdb7))
* add Registry and CryptoService and refactor SessionManagement ([852fe8b](https://github.com/loopingz/webda.io/commit/852fe8b076736530e18becc1479814d1cf03ccfc))
* add WS proxy system ([fdc394d](https://github.com/loopingz/webda.io/commit/fdc394de666d74e9130d29fb6d4ddd67b650430f))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* change canAct signature and create checkAct ([bf09a8b](https://github.com/loopingz/webda.io/commit/bf09a8bc8ff4248661d753e75310898fbc6544b1))
* implement basic dynamodb webdaql ([b1c7246](https://github.com/loopingz/webda.io/commit/b1c724648f950305cf4b962940aaa6319b15794b))
* move to es module ([2234943](https://github.com/loopingz/webda.io/commit/22349431f8241fda7a10ecdeb6563a676b935320))
* Operation annotation registration ([6652f5a](https://github.com/loopingz/webda.io/commit/6652f5af75b466b90ff0706abdf2e4a7a08ef318))
* remove case insensitive for moddas ([b7d3336](https://github.com/loopingz/webda.io/commit/b7d333632adeb037141d54da43701a1f34ee09f5))
* remove dynamic lastUpdate and creationDate ([ed9bcb3](https://github.com/loopingz/webda.io/commit/ed9bcb30691a5ff0c4c3769d572f39548c6d9b05))
* remove express and update way to manage request body ([38d8317](https://github.com/loopingz/webda.io/commit/38d8317566519d2a4f2fd47db56f7502219c13bb))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))
* remove obsolete methods ([dff9a03](https://github.com/loopingz/webda.io/commit/dff9a032691094bea1d308788416a77b4279cdc7))
* rename from sql to webdaql ([67830a8](https://github.com/loopingz/webda.io/commit/67830a885a9eb8f2fe6b2ce8f48c5f415c5b2e8e))
* simplify configuration services by removing the webda node ([76487dc](https://github.com/loopingz/webda.io/commit/76487dc3fe1d8dc5f09d63f8607799799f3438b0))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* add OrderBy clause handler for GCP ([bad0f9e](https://github.com/loopingz/webda.io/commit/bad0f9e1c7c6d594144ad2cf5a0889af3e05bce0))
* amqp unit tests ([8d0ca6d](https://github.com/loopingz/webda.io/commit/8d0ca6dbd9e5c6a9331c3dda439788aff0701650))
* collection cleaner ([d50146d](https://github.com/loopingz/webda.io/commit/d50146d1d426a1b5ec85581d0ffe6e47ec6c248d))
* do not reload on cachedModule ([5add438](https://github.com/loopingz/webda.io/commit/5add438d5b9a4d28dcdca172e721fa0d7949bfc2))
* exit -1 if compilation fail ([f373d45](https://github.com/loopingz/webda.io/commit/f373d4589910e9066175ff538b05fb0787800c62))
* FileBinary folder ([eff3469](https://github.com/loopingz/webda.io/commit/eff346975968e64304e90e9d59e286e2dba53642))
* FireBase query implementation ([e19c998](https://github.com/loopingz/webda.io/commit/e19c9980bdb4a2e2e45de3288e128233f191c9e4))
* gcp firebase date management ([7ef0577](https://github.com/loopingz/webda.io/commit/7ef0577b8c87bd19d47003831d732f01d42ab9e1))
* gcp/google-auth/elasticsearch unit tests ([7fc2cd1](https://github.com/loopingz/webda.io/commit/7fc2cd18cfa44fff83900afb03588454b2110983))
* **gcp:** getAll issue ([bbded34](https://github.com/loopingz/webda.io/commit/bbded3409a669b2091b7e191808b4d6a3c19cc0d))
* hawk unit test ([5f2adc6](https://github.com/loopingz/webda.io/commit/5f2adc6a1d55bcac370f46b518148b90ac151efc))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* improve hawk management of vanished key ([952ca4c](https://github.com/loopingz/webda.io/commit/952ca4ce4ae66d67b4255fdeeaaaa8fd1a5e1303))
* incorrect Date object on query ([ee114f6](https://github.com/loopingz/webda.io/commit/ee114f63e5bc4668f53de0a89c8ebc8726e0fdff))
* reinit of stream within constructor of Context ([8c138f1](https://github.com/loopingz/webda.io/commit/8c138f1fe3ee2c1f7b711072b944ee5f7a5780ff))
* remove unreachable code ([2f49e55](https://github.com/loopingz/webda.io/commit/2f49e5517e232b981b85a06ed8a9d7a54d3fb169))
* unit test ([ee508e7](https://github.com/loopingz/webda.io/commit/ee508e784de09ddfcff70108d0f7e9a154c0f458))
* unit test and coverage ([25a5160](https://github.com/loopingz/webda.io/commit/25a5160c64592a45575460d317725ac835a6aa98))
* update module jsons ([5556aa5](https://github.com/loopingz/webda.io/commit/5556aa5c33ff458ee3bd4e07f32c6a5dae430c8b))
* use enhanced cron with cronId ([978f12d](https://github.com/loopingz/webda.io/commit/978f12dc3349eeada91afbc22bb23afdfafff38a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
  * devDependencies
    * @webda/async bumped from ^3.0.3 to ^4.0.0
    * @webda/shell bumped from ^3.1.0 to ^4.0.0

## [3.1.0](https://github.com/loopingz/webda.io/compare/gcp-v3.0.2...gcp-v3.1.0) (2023-06-30)


### Features

* add WS proxy system ([fdc394d](https://github.com/loopingz/webda.io/commit/fdc394de666d74e9130d29fb6d4ddd67b650430f))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.0.2 to ^3.1.0
  * devDependencies
    * @webda/async bumped from ^3.0.2 to ^3.0.3
    * @webda/shell bumped from ^3.0.2 to ^3.1.0

## Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.
