# Changelog

## [4.0.0](https://github.com/loopingz/webda.io/compare/async-v3.0.3...async-v4.0.0) (2023-06-30)


### ⚠ BREAKING CHANGES

* remove dynamic lastUpdate and creationDate
* use WebdaError instead of number for http code
* remove case insensitive for moddas
* remove node14 support
* remove Context reference to only use OperationContext and WebContext
* typing of Constructor

### Features

* add a Cron exporter shell for @webda/kubernetes ([7a349a4](https://github.com/loopingz/webda.io/commit/7a349a430fe8dfd8a3cc3491cac00c41dc97c362))
* add a helper to execute locally asyncaction ([1af870c](https://github.com/loopingz/webda.io/commit/1af870c301ccc2cf971567e7f133ff52b5d995c7))
* add a verifyJobRequest to allow adding more api available to jobs ([cf27e60](https://github.com/loopingz/webda.io/commit/cf27e6055a6bfe4b18c428a18a57245b726a00df))
* add async operations definition checkers ([62f09cb](https://github.com/loopingz/webda.io/commit/62f09cb76ae32fc8f95a1a5b260acb118a230674))
* add asyncoperationaction ([6f86c17](https://github.com/loopingz/webda.io/commit/6f86c17d174c5ddc94563ba9b9ab973e8f4bb17f))
* add download/upload to AsyncJobService ([62dfead](https://github.com/loopingz/webda.io/commit/62dfeadccf7299c073755483df8b0c22b38f5992))
* add factory and permission query ([68ee7e9](https://github.com/loopingz/webda.io/commit/68ee7e92b0e0747b9ca1d796fcfb25919a5b58b2))
* add launcher customization ([37642a6](https://github.com/loopingz/webda.io/commit/37642a680234b505049c97d4814ef677bb5f03e5))
* add multiple increment to Store ([e6aea54](https://github.com/loopingz/webda.io/commit/e6aea54d2908e43816cd8043a0fdf209e5b04707))
* add Operations exporter code and configuration ([75ffd10](https://github.com/loopingz/webda.io/commit/75ffd1064a56f81f9df33e1babe5c10d31f2680f))
* add Proxy on CoreModel ([845c7b9](https://github.com/loopingz/webda.io/commit/845c7b91d6704ed07cb17a8ee17ac50878b9880c))
* add ProxyService ([c61a772](https://github.com/loopingz/webda.io/commit/c61a77284205c20bf12e305b6c7c88987ed62a43))
* add reflections for CoreModel attributes ([7a17145](https://github.com/loopingz/webda.io/commit/7a17145f5b4495ee124931c79b77afee2031bdb7))
* add Registry and CryptoService and refactor SessionManagement ([852fe8b](https://github.com/loopingz/webda.io/commit/852fe8b076736530e18becc1479814d1cf03ccfc))
* add scheduled actions ([f1678f5](https://github.com/loopingz/webda.io/commit/f1678f5bf8693c6d252d9f30bcd41020a2580d51))
* add service runner ([ce0a258](https://github.com/loopingz/webda.io/commit/ce0a25837672ce33be97cc4de9839e8d542d735f))
* add store advanced typing ([5670e4b](https://github.com/loopingz/webda.io/commit/5670e4b95fae9325dd60ad131e038eeea3c26a73))
* add websockets module ([f10642d](https://github.com/loopingz/webda.io/commit/f10642d646ebef5b5ff1c62a87c4fb28fcabfef0))
* allow custom asyncwebdaaction models ([bba4b71](https://github.com/loopingz/webda.io/commit/bba4b71db1cf5681b1be576c5363d925b05c228d))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* asyncjobservice local launch ([964c68e](https://github.com/loopingz/webda.io/commit/964c68edf497a16ad75048726daaa9a466f56a1d))
* change launchWorker to localLaunch ([0e05269](https://github.com/loopingz/webda.io/commit/0e052690880a6d5a4a4215af7e3c7abd18436a95))
* move to es module ([2234943](https://github.com/loopingz/webda.io/commit/22349431f8241fda7a10ecdeb6563a676b935320))
* Operation annotation registration ([6652f5a](https://github.com/loopingz/webda.io/commit/6652f5af75b466b90ff0706abdf2e4a7a08ef318))
* remove case insensitive for moddas ([b7d3336](https://github.com/loopingz/webda.io/commit/b7d333632adeb037141d54da43701a1f34ee09f5))
* remove Context reference to only use OperationContext and WebContext ([caa286d](https://github.com/loopingz/webda.io/commit/caa286d8d077ee3e4932952e34f2e80bfed0bdf3))
* remove dynamic lastUpdate and creationDate ([ed9bcb3](https://github.com/loopingz/webda.io/commit/ed9bcb30691a5ff0c4c3769d572f39548c6d9b05))
* remove express and update way to manage request body ([38d8317](https://github.com/loopingz/webda.io/commit/38d8317566519d2a4f2fd47db56f7502219c13bb))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))
* typing of Constructor ([c136978](https://github.com/loopingz/webda.io/commit/c136978becd71f63d0eb985b62d274c218b0e3b0))
* use WebdaError instead of number for http code ([144f1f5](https://github.com/loopingz/webda.io/commit/144f1f510111048b3282524a2609c449c5bc5de7))


### Bug Fixes

* add devMode for websockets authorizer ([6b3f2c0](https://github.com/loopingz/webda.io/commit/6b3f2c036de94cef257a0d75bd8d1737e7cc64ba))
* add missing dependencies for pnpm/bazel ([1ec04a3](https://github.com/loopingz/webda.io/commit/1ec04a375998ee7a7a00ea03c30a2960b7778d6b))
* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* add scheduler test ([d359f3a](https://github.com/loopingz/webda.io/commit/d359f3ac1bc1240c7e9c13d31ce2cbecf06ebc32))
* async unit test ([d78da1d](https://github.com/loopingz/webda.io/commit/d78da1d8d53283a7ef6a0e3db31e20003d335751))
* code coverage missing lines ([379cb58](https://github.com/loopingz/webda.io/commit/379cb588306557e23698cb6dbc6fab430b3c12f9))
* code smells ([c2dd2b0](https://github.com/loopingz/webda.io/commit/c2dd2b08ee21ec4b88ec8901820d394a99b780df))
* core unit tests ([cddb5c4](https://github.com/loopingz/webda.io/commit/cddb5c480057020651f3e4e4337396c979b83ca7))
* CoreModel save on instanciate model ([18b6ae8](https://github.com/loopingz/webda.io/commit/18b6ae896e2483c80d9a827eab4a679a889ae941))
* do not reload on cachedModule ([5add438](https://github.com/loopingz/webda.io/commit/5add438d5b9a4d28dcdca172e721fa0d7949bfc2))
* elasticsearch 8.x ([79d4750](https://github.com/loopingz/webda.io/commit/79d4750f9490ac0ee0923e6fcc00493ed3815981))
* es test ([7959037](https://github.com/loopingz/webda.io/commit/79590378cb43fb15d8acd0e0eabf5cf972d41df5))
* FileBinary folder ([eff3469](https://github.com/loopingz/webda.io/commit/eff346975968e64304e90e9d59e286e2dba53642))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* logger capture timeout management ([3e7f288](https://github.com/loopingz/webda.io/commit/3e7f288a2de1fb4880824343289b021b1cadcba5))
* mongodb unit tests ([3b33c91](https://github.com/loopingz/webda.io/commit/3b33c915d76d827adb41346d87afb1dbdb825ae1))
* multi-headers management ([1f9fb7d](https://github.com/loopingz/webda.io/commit/1f9fb7d1cb2f10b4a348ecaac95f66d3b850e8bc))
* operation input verification ([b118c96](https://github.com/loopingz/webda.io/commit/b118c96fd22852f1cffe8bb8487be322279acb88))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))
* remove unreachable code ([2f49e55](https://github.com/loopingz/webda.io/commit/2f49e5517e232b981b85a06ed8a9d7a54d3fb169))
* shell unit tests ([9df941a](https://github.com/loopingz/webda.io/commit/9df941abc1d32bf2be1b37f5f92123928311082d))
* sonar ([4f08f95](https://github.com/loopingz/webda.io/commit/4f08f951407a9f39e3ce540ea3212970af38112f))
* update module jsons ([5556aa5](https://github.com/loopingz/webda.io/commit/5556aa5c33ff458ee3bd4e07f32c6a5dae430c8b))
* update stream read on HttpContext ([f3e35bb](https://github.com/loopingz/webda.io/commit/f3e35bbcfb68aaa8d3f14c8f8f4d19153145191b))
* use enhanced cron with cronId ([978f12d](https://github.com/loopingz/webda.io/commit/978f12dc3349eeada91afbc22bb23afdfafff38a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
  * devDependencies
    * @webda/tsc-esm bumped from ^1.0.4 to ^2.0.0

## [3.0.3](https://github.com/loopingz/webda.io/compare/async-v3.0.2...async-v3.0.3) (2023-06-30)


### Bug Fixes

* add missing dependencies for pnpm/bazel ([1ec04a3](https://github.com/loopingz/webda.io/commit/1ec04a375998ee7a7a00ea03c30a2960b7778d6b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.0.2 to ^3.1.0
  * devDependencies
    * @webda/tsc-esm bumped from ^1.0.3 to ^1.0.4
