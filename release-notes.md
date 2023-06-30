:robot: I have created a release *beep* *boop*
---


<details><summary>amqp: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/amqp-v3.0.3...amqp-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

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


### Bug Fixes

* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* amqp unit tests ([8d0ca6d](https://github.com/loopingz/webda.io/commit/8d0ca6dbd9e5c6a9331c3dda439788aff0701650))
* code smells and put upsert test ([0cff79a](https://github.com/loopingz/webda.io/commit/0cff79aa653885e7e5297d3eae5f3126e505c6db))
* hawk unit test ([5f2adc6](https://github.com/loopingz/webda.io/commit/5f2adc6a1d55bcac370f46b518148b90ac151efc))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))
* remove local stomp definition ([06fbc70](https://github.com/loopingz/webda.io/commit/06fbc70d359624bb4ae8051e04f49aa87e6c20c7))
* remove unreachable code ([2f49e55](https://github.com/loopingz/webda.io/commit/2f49e5517e232b981b85a06ed8a9d7a54d3fb169))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
  * devDependencies
    * @webda/shell bumped from ^3.1.0 to ^4.0.0
</details>

<details><summary>async: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/async-v3.0.3...async-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

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
</details>

<details><summary>aws: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/aws-v3.1.0...aws-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

* move Binary to BinaryService
* simplify configuration services by removing the webda node
* remove dynamic lastUpdate and creationDate
* change canAct signature and create checkAct
* use WebdaError instead of number for http code
* remove obsolete methods
* remove case insensitive for moddas
* remove node14 support

### Features

* add a Cron exporter shell for @webda/kubernetes ([7a349a4](https://github.com/loopingz/webda.io/commit/7a349a430fe8dfd8a3cc3491cac00c41dc97c362))
* add binary routes on DomainService ([6aadb04](https://github.com/loopingz/webda.io/commit/6aadb043fc51f88c0fa37e157f7af56177160254))
* add binary/binaries attribute mapper ([c10be30](https://github.com/loopingz/webda.io/commit/c10be30bb8a878bc70a108d06e359978f887a539))
* add CONTAINS operator for WebdaQL ([836093f](https://github.com/loopingz/webda.io/commit/836093f951a65dbd3d3f41443e2babea0ed7f3d9))
* add factory and permission query ([68ee7e9](https://github.com/loopingz/webda.io/commit/68ee7e92b0e0747b9ca1d796fcfb25919a5b58b2))
* add generic way to get the types for a model ([bb163e3](https://github.com/loopingz/webda.io/commit/bb163e3db7d5754c1ce457ddb930585e33e0a1a2))
* add getClientIp on HttpContext ([512bebc](https://github.com/loopingz/webda.io/commit/512bebc3318c933bfaa952ca23779b63c5e7322a))
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
* add rotate-keys webda command ([1231fef](https://github.com/loopingz/webda.io/commit/1231fefc0ce7d26a0de5d4e72b6c5faee8b95e3c))
* allow redirect with WebdaError.Redirect ([499432e](https://github.com/loopingz/webda.io/commit/499432edd2bc9b542d7551b398a8b32648f04c4e))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* allow two types of request filter (CORS and normal) ([cecfc0b](https://github.com/loopingz/webda.io/commit/cecfc0b4b5df76a32c2a3f1de3980e71c672d0fc))
* **aws:** add deduplicationId to SQS sendMessage ([f7da95a](https://github.com/loopingz/webda.io/commit/f7da95a111ff5d195e92c53d641c5cbc058418f0))
* change canAct signature and create checkAct ([bf09a8b](https://github.com/loopingz/webda.io/commit/bf09a8bc8ff4248661d753e75310898fbc6544b1))
* ensure checkRequest return at least true ([68d7fc3](https://github.com/loopingz/webda.io/commit/68d7fc3340197915180acea5711d4d9c6e5d9fef))
* implement basic dynamodb webdaql ([b1c7246](https://github.com/loopingz/webda.io/commit/b1c724648f950305cf4b962940aaa6319b15794b))
* move Binary to BinaryService ([9db461b](https://github.com/loopingz/webda.io/commit/9db461b994db617b443aa2606b8b64d9c7a49a69))
* move to es module ([2234943](https://github.com/loopingz/webda.io/commit/22349431f8241fda7a10ecdeb6563a676b935320))
* Operation annotation registration ([6652f5a](https://github.com/loopingz/webda.io/commit/6652f5af75b466b90ff0706abdf2e4a7a08ef318))
* remove case insensitive for moddas ([b7d3336](https://github.com/loopingz/webda.io/commit/b7d333632adeb037141d54da43701a1f34ee09f5))
* remove dynamic lastUpdate and creationDate ([ed9bcb3](https://github.com/loopingz/webda.io/commit/ed9bcb30691a5ff0c4c3769d572f39548c6d9b05))
* remove express and update way to manage request body ([38d8317](https://github.com/loopingz/webda.io/commit/38d8317566519d2a4f2fd47db56f7502219c13bb))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))
* remove obsolete methods ([dff9a03](https://github.com/loopingz/webda.io/commit/dff9a032691094bea1d308788416a77b4279cdc7))
* rename from sql to webdaql ([67830a8](https://github.com/loopingz/webda.io/commit/67830a885a9eb8f2fe6b2ce8f48c5f415c5b2e8e))
* simplify configuration services by removing the webda node ([76487dc](https://github.com/loopingz/webda.io/commit/76487dc3fe1d8dc5f09d63f8607799799f3438b0))
* use WebdaError instead of number for http code ([144f1f5](https://github.com/loopingz/webda.io/commit/144f1f510111048b3282524a2609c449c5bc5de7))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* add MessageDeduplicationId only for fifo queue ([73a8566](https://github.com/loopingz/webda.io/commit/73a8566b05fe4061201f1574cdc4f47aee95efb1))
* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* amqp unit tests ([8d0ca6d](https://github.com/loopingz/webda.io/commit/8d0ca6dbd9e5c6a9331c3dda439788aff0701650))
* aws test ([f351d4d](https://github.com/loopingz/webda.io/commit/f351d4d61046918e002062e8e94b58101636c7cc))
* aws unit tests ([fea780c](https://github.com/loopingz/webda.io/commit/fea780cc960945484e36f37f8833ec4742828a70))
* code smells and put upsert test ([0cff79a](https://github.com/loopingz/webda.io/commit/0cff79aa653885e7e5297d3eae5f3126e505c6db))
* codeql code quality issues ([81c0bfb](https://github.com/loopingz/webda.io/commit/81c0bfb8a55d1d4ebcf8ea663454e7f80acce4e0))
* compilation issue ([08f51f3](https://github.com/loopingz/webda.io/commit/08f51f34a253a111325cbcb517362fa818da3c5a))
* core codecov ([4b73163](https://github.com/loopingz/webda.io/commit/4b731639f1bb3c1e33677de5607ccc3e1eb48c07))
* core unit tests ([cddb5c4](https://github.com/loopingz/webda.io/commit/cddb5c480057020651f3e4e4337396c979b83ca7))
* deployer namespace ([d0fbbca](https://github.com/loopingz/webda.io/commit/d0fbbca80b69add5930b43c8c4a185b45012d347))
* do not reload on cachedModule ([5add438](https://github.com/loopingz/webda.io/commit/5add438d5b9a4d28dcdca172e721fa0d7949bfc2))
* DomainService query and Host header for proxy ([73dfdce](https://github.com/loopingz/webda.io/commit/73dfdce59add5e3d43aa1a9dd4121d2353a21489))
* dynamodb and mongodb queries ([0db11c6](https://github.com/loopingz/webda.io/commit/0db11c676da03c2c18f999d8bbccd046600133ea))
* elasticsearch 8.x ([79d4750](https://github.com/loopingz/webda.io/commit/79d4750f9490ac0ee0923e6fcc00493ed3815981))
* exit -1 if compilation fail ([f373d45](https://github.com/loopingz/webda.io/commit/f373d4589910e9066175ff538b05fb0787800c62))
* FileBinary folder ([eff3469](https://github.com/loopingz/webda.io/commit/eff346975968e64304e90e9d59e286e2dba53642))
* gcp firebase date management ([7ef0577](https://github.com/loopingz/webda.io/commit/7ef0577b8c87bd19d47003831d732f01d42ab9e1))
* gcp/google-auth/elasticsearch unit tests ([7fc2cd1](https://github.com/loopingz/webda.io/commit/7fc2cd18cfa44fff83900afb03588454b2110983))
* hawk move to CORSFilter ([cc33c78](https://github.com/loopingz/webda.io/commit/cc33c7835d93ac8ef77af2e4cff706023ff5137e))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* improve error message for unsupported diagrams ([03238b0](https://github.com/loopingz/webda.io/commit/03238b072ad3525ed463212fc77463f958259f90))
* init handler before calling ([8d22dd7](https://github.com/loopingz/webda.io/commit/8d22dd700e1f27988bdae84c53a543eba1627982))
* multi-headers management ([1f9fb7d](https://github.com/loopingz/webda.io/commit/1f9fb7d1cb2f10b4a348ecaac95f66d3b850e8bc))
* path+ parameters on AWS API Gateway (Close [#193](https://github.com/loopingz/webda.io/issues/193)) ([088b36c](https://github.com/loopingz/webda.io/commit/088b36c9c4d158dea4352735408a131de864acb5))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))
* reinit of stream within constructor of Context ([8c138f1](https://github.com/loopingz/webda.io/commit/8c138f1fe3ee2c1f7b711072b944ee5f7a5780ff))
* remove unreachable code ([2f49e55](https://github.com/loopingz/webda.io/commit/2f49e5517e232b981b85a06ed8a9d7a54d3fb169))
* should not check CORS if no origin is set ([6cf59a1](https://github.com/loopingz/webda.io/commit/6cf59a17e7a2cfffc98356a89ec7b778f079f26e))
* unit test ([ee508e7](https://github.com/loopingz/webda.io/commit/ee508e784de09ddfcff70108d0f7e9a154c0f458))
* unit test add Host header ([0d57794](https://github.com/loopingz/webda.io/commit/0d577949020bbdf26ab331758d033d01cfaef945))
* unit test and coverage ([25a5160](https://github.com/loopingz/webda.io/commit/25a5160c64592a45575460d317725ac835a6aa98))
* upgrade iam-policy-optimizer to remove aws-sdk dep ([3da4251](https://github.com/loopingz/webda.io/commit/3da4251c88f168d6cc9c9d83943dcf28158175c4))
* wait for custom lambda launch ([5cb6094](https://github.com/loopingz/webda.io/commit/5cb6094cfe8324ad55d901eaa6317131757e21fc))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
  * devDependencies
    * @webda/async bumped from ^3.0.3 to ^4.0.0
    * @webda/shell bumped from ^3.1.0 to ^4.0.0
</details>

<details><summary>core: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/core-v3.1.0...core-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

* remove idents mapper from default User class
* invitation move to model driven and not store
* move Binary to BinaryService
* simplify configuration services by removing the webda node
* remove dynamic lastUpdate and creationDate
* change canAct signature and create checkAct
* use WebdaError instead of number for http code
* remove obsolete methods
* remove case insensitive for moddas
* remove deprecated _jsonFilter and operation checks
* move fullUuid to __type$uuid
* refactor Context provider and models analysis
* remove node14 support
* remove Context reference to only use OperationContext and WebContext
* typing of Constructor

### Features

* add @Action annotation for CoreModel action ([7797e88](https://github.com/loopingz/webda.io/commit/7797e88004a658d67661b287ee9de339d3673a66))
* add a --watcher option to build ([e98b4f7](https://github.com/loopingz/webda.io/commit/e98b4f7f2438655cfcaa13e70351337ac570bc8a))
* add a attributePermission method in CoreModel ([5a869d0](https://github.com/loopingz/webda.io/commit/5a869d051b3ea55bc01b4a50a69d98bdee96f72f))
* add a CacheStore option to Store ([222f752](https://github.com/loopingz/webda.io/commit/222f752df1dcb9d30a514a2279b37faf91eadc76))
* add a Cron exporter shell for @webda/kubernetes ([7a349a4](https://github.com/loopingz/webda.io/commit/7a349a430fe8dfd8a3cc3491cac00c41dc97c362))
* add a noCache option for FileStore ([d2471f3](https://github.com/loopingz/webda.io/commit/d2471f3f4aaf63fa264f279a42dd61eac3fb5897))
* add a prefix api option ([c15bf2b](https://github.com/loopingz/webda.io/commit/c15bf2b7ea81ead6a7964b6d00cece3b7c5a9ff5))
* add a unflatten system ([c7fb93b](https://github.com/loopingz/webda.io/commit/c7fb93bc3a6a9abc7348b51fd327950b9e00a969))
* add alias store and queryAll method ([fe3ae81](https://github.com/loopingz/webda.io/commit/fe3ae81a1863d9498de51ff4a7ee54b6e399ef91))
* add aliasstore ([8a97355](https://github.com/loopingz/webda.io/commit/8a9735591257d1ef9b95b6d3770b425ce6896005))
* add an option to validate without required for schema ([b0913de](https://github.com/loopingz/webda.io/commit/b0913deb327e8e30edaf9dca85366ae35d5acdbf))
* add async operations definition checkers ([62f09cb](https://github.com/loopingz/webda.io/commit/62f09cb76ae32fc8f95a1a5b260acb118a230674))
* add asyncoperationaction ([6f86c17](https://github.com/loopingz/webda.io/commit/6f86c17d174c5ddc94563ba9b9ab973e8f4bb17f))
* add binary routes on DomainService ([6aadb04](https://github.com/loopingz/webda.io/commit/6aadb043fc51f88c0fa37e157f7af56177160254))
* add binary/binaries attribute mapper ([c10be30](https://github.com/loopingz/webda.io/commit/c10be30bb8a878bc70a108d06e359978f887a539))
* add CONTAINS operator for WebdaQL ([836093f](https://github.com/loopingz/webda.io/commit/836093f951a65dbd3d3f41443e2babea0ed7f3d9))
* add CoreModel relations definition ([ef22d6a](https://github.com/loopingz/webda.io/commit/ef22d6a4ffe5c19266852ed5f5f0e23642601531))
* add default to attribute name for Inject ([e2acf85](https://github.com/loopingz/webda.io/commit/e2acf8548faedf6244a5407695466d588d33ad3c))
* add download/upload to AsyncJobService ([62dfead](https://github.com/loopingz/webda.io/commit/62dfeadccf7299c073755483df8b0c22b38f5992))
* add escape mechanism to replaceVariables ([f1c8840](https://github.com/loopingz/webda.io/commit/f1c88405671e86f927ae8df5565819cc210e4930))
* add factory and permission query ([68ee7e9](https://github.com/loopingz/webda.io/commit/68ee7e92b0e0747b9ca1d796fcfb25919a5b58b2))
* add finder utils for FileUtils ([ae19e69](https://github.com/loopingz/webda.io/commit/ae19e6948236b14708352f4c8e684f9ab8ca8082))
* add flat/unflat as static of CoreModel ([9838605](https://github.com/loopingz/webda.io/commit/983860543fd482a5c4a30f26ee29337f99e3671a))
* add generic way to get the types for a model ([bb163e3](https://github.com/loopingz/webda.io/commit/bb163e3db7d5754c1ce457ddb930585e33e0a1a2))
* add getClientIp on HttpContext ([512bebc](https://github.com/loopingz/webda.io/commit/512bebc3318c933bfaa952ca23779b63c5e7322a))
* add imports feature in Configuration ([eb4dbe6](https://github.com/loopingz/webda.io/commit/eb4dbe62d331fa29010bf10d82d87bebb404b3b9))
* add infered typing for getServicesOfType ([f7edbf3](https://github.com/loopingz/webda.io/commit/f7edbf320ada817f1b64e1d6f0ff6ec86782de1c))
* add jwks endpoint ([4f44f29](https://github.com/loopingz/webda.io/commit/4f44f29d8f3048e7d18bd05876c5dedb8c0c9bdf))
* add launcher customization ([37642a6](https://github.com/loopingz/webda.io/commit/37642a680234b505049c97d4814ef677bb5f03e5))
* add listOperations method ([7dc2cae](https://github.com/loopingz/webda.io/commit/7dc2cae212d649b554443271217f03a0cc69a039))
* add models export feature and shortIds ([bc20e1a](https://github.com/loopingz/webda.io/commit/bc20e1a4ef0aca8c503b18633e1ebb790d0656d9))
* add mongodb query mapping ([d6f8b83](https://github.com/loopingz/webda.io/commit/d6f8b834471245746ad81c11bd7314a75e1b40d9))
* add multiple increment to Store ([e6aea54](https://github.com/loopingz/webda.io/commit/e6aea54d2908e43816cd8043a0fdf209e5b04707))
* add OperationContext ([bad48b4](https://github.com/loopingz/webda.io/commit/bad48b4843c5c228acfa6474b12a9b03b047ec41))
* add Operations exporter code and configuration ([75ffd10](https://github.com/loopingz/webda.io/commit/75ffd1064a56f81f9df33e1babe5c10d31f2680f))
* add ORDER BY clause ([5ae1cc0](https://github.com/loopingz/webda.io/commit/5ae1cc0688cc86d8aa294088f03980543a4d81d7))
* add Proxy on CoreModel ([845c7b9](https://github.com/loopingz/webda.io/commit/845c7b91d6704ed07cb17a8ee17ac50878b9880c))
* add ProxyService ([c61a772](https://github.com/loopingz/webda.io/commit/c61a77284205c20bf12e305b6c7c88987ed62a43))
* add putRedirectUrl for Google Storage ([ec03b09](https://github.com/loopingz/webda.io/commit/ec03b0900bff3ed6208abd4e358f401d08657131))
* add query mapper for SQL ([a1bf776](https://github.com/loopingz/webda.io/commit/a1bf7766f3f078bf5e9c126376b6f00508c82c53))
* add rawProxy to proxy service ([0b6b38a](https://github.com/loopingz/webda.io/commit/0b6b38a73b5b37e7d7c87c8550bb22e72bdc3441))
* add ref(..) to allow uid autocompletion ([de16cae](https://github.com/loopingz/webda.io/commit/de16cae506223322e4137b77b03afd4c84c22942))
* add reflections for CoreModel attributes ([7a17145](https://github.com/loopingz/webda.io/commit/7a17145f5b4495ee124931c79b77afee2031bdb7))
* add Registry and CryptoService and refactor SessionManagement ([852fe8b](https://github.com/loopingz/webda.io/commit/852fe8b076736530e18becc1479814d1cf03ccfc))
* add relations definition ([7184bc0](https://github.com/loopingz/webda.io/commit/7184bc0e6bebb1b251a07337cb5587d383c97c6a))
* add resource file only serve ([2e49555](https://github.com/loopingz/webda.io/commit/2e49555b0a52aa5ab41c4077df37684993ac156d))
* add rotate-keys webda command ([1231fef](https://github.com/loopingz/webda.io/commit/1231fefc0ce7d26a0de5d4e72b6c5faee8b95e3c))
* add scheduled actions ([f1678f5](https://github.com/loopingz/webda.io/commit/f1678f5bf8693c6d252d9f30bcd41020a2580d51))
* add several getUuid format (Close [#169](https://github.com/loopingz/webda.io/issues/169)) ([ffa7919](https://github.com/loopingz/webda.io/commit/ffa7919ab9dc6f6620fab71d902d6601015d0853))
* add specific schema exporter for relations ([9b67109](https://github.com/loopingz/webda.io/commit/9b6710902168276e34a0c913080a1e749e758f37))
* add StorageFinder interface ([4321175](https://github.com/loopingz/webda.io/commit/432117569a056cb14955769c04a9c075f3a84b35))
* add store advanced typing ([5670e4b](https://github.com/loopingz/webda.io/commit/5670e4b95fae9325dd60ad131e038eeea3c26a73))
* add store export command and fix yargs extension for webda.shell.json ([1027282](https://github.com/loopingz/webda.io/commit/10272828d7119be2f93abe09284bfd9fe23518f5))
* add Store migration and refactors ([9d3a8dc](https://github.com/loopingz/webda.io/commit/9d3a8dc45c13fdd8c7293f2c3d1c54304aeb261f))
* add Throttler util ([8805ba6](https://github.com/loopingz/webda.io/commit/8805ba657a0d574528f733e00fef1c2dae474617))
* add trusted proxies and full uuid on coremodel ([cdd0435](https://github.com/loopingz/webda.io/commit/cdd043585da9a0c19b1b95c800ec10444b4fd721))
* add type of check for checkRequest ([95f40cf](https://github.com/loopingz/webda.io/commit/95f40cff03add97d91a972a9db6423bc79ffa630))
* add URL object info to HttpContext ([3f2e386](https://github.com/loopingz/webda.io/commit/3f2e386a3a388de3b90dbb81db25ed4c523f0b48))
* add WebdaQL parser ([cd61e33](https://github.com/loopingz/webda.io/commit/cd61e33af9d171c4338f6f25214730b7515082de))
* add WebdaQL.SetterValidator to allow set attributes via query ([7309de2](https://github.com/loopingz/webda.io/commit/7309de20b15bf48114d484599fb41417d40c8d34))
* add websockets module ([f10642d](https://github.com/loopingz/webda.io/commit/f10642d646ebef5b5ff1c62a87c4fb28fcabfef0))
* add WS proxy system ([fdc394d](https://github.com/loopingz/webda.io/commit/fdc394de666d74e9130d29fb6d4ddd67b650430f))
* allow additional JSDocs on schema generation ([0eaee71](https://github.com/loopingz/webda.io/commit/0eaee71aba508d4c48263a49d8a9947b5b58e5f9))
* allow multi models store ([3b07434](https://github.com/loopingz/webda.io/commit/3b07434ac34889c341460848351934702ce18081))
* allow ProxyService to not send X-Forwarded-* headers ([f54e23a](https://github.com/loopingz/webda.io/commit/f54e23aca58ab47ef361e09777a8a7209e3a64ed))
* allow redirect from checkRequest ([e88bd69](https://github.com/loopingz/webda.io/commit/e88bd6953f962a47734b4a3c68e1ecba10843076))
* allow request by default if no request filter is defined ([d2c3bf1](https://github.com/loopingz/webda.io/commit/d2c3bf1b06e3417626b867209a6bcab3c7c52c96))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* allow two types of request filter (CORS and normal) ([cecfc0b](https://github.com/loopingz/webda.io/commit/cecfc0b4b5df76a32c2a3f1de3980e71c672d0fc))
* allow usage of lowercase log level ([6e8efdb](https://github.com/loopingz/webda.io/commit/6e8efdbbdfee1cbe1bcb04e9daf17a4aab89ae1f))
* change canAct signature and create checkAct ([bf09a8b](https://github.com/loopingz/webda.io/commit/bf09a8bc8ff4248661d753e75310898fbc6544b1))
* exclude node_modules/.cache/nx from findModules ([5900e4d](https://github.com/loopingz/webda.io/commit/5900e4d4f736a64d059a7540e048d57f05d2125a))
* graphql module ([ef81dd5](https://github.com/loopingz/webda.io/commit/ef81dd5c948f9e56c12f6dfb055427d7ca742ca8))
* implement basic dynamodb webdaql ([b1c7246](https://github.com/loopingz/webda.io/commit/b1c724648f950305cf4b962940aaa6319b15794b))
* improve FileUtils walk and find ([d4d006b](https://github.com/loopingz/webda.io/commit/d4d006b6fec0ba41766e4ae69674e3a971e4b67d))
* improve openapi quality ([18bb96e](https://github.com/loopingz/webda.io/commit/18bb96e60edd7dcb9ce81c2f37ba484b56ce7dc9))
* invitation move to model driven and not store ([48a70ef](https://github.com/loopingz/webda.io/commit/48a70efd197b99c77a4bd08128ef56918f6398c2))
* Model driven store ([915e777](https://github.com/loopingz/webda.io/commit/915e777b6fc07ade8cbdc5685179d7f59d40ed27))
* move Binary to BinaryService ([9db461b](https://github.com/loopingz/webda.io/commit/9db461b994db617b443aa2606b8b64d9c7a49a69))
* move fullUuid to __type$uuid ([1fea719](https://github.com/loopingz/webda.io/commit/1fea719ccb839413048abea4f04dfcc5daa7b2ff))
* move to a NotEnumerable decorator ([91eaade](https://github.com/loopingz/webda.io/commit/91eaade9d4e06eff95c86d07bc9dc3ed54089c60))
* move to es module ([2234943](https://github.com/loopingz/webda.io/commit/22349431f8241fda7a10ecdeb6563a676b935320))
* move to radix 36 for keyid ([fad03e3](https://github.com/loopingz/webda.io/commit/fad03e3085fa383efe086d40f11130b30d8c0b8c))
* Operation annotation registration ([6652f5a](https://github.com/loopingz/webda.io/commit/6652f5af75b466b90ff0706abdf2e4a7a08ef318))
* prometheus metrics addition ([aae71ef](https://github.com/loopingz/webda.io/commit/aae71efafe76446b2538a926afe6ccda1a227cb8))
* refactor Context provider and models analysis ([f035f44](https://github.com/loopingz/webda.io/commit/f035f4459b3237020901deb8e283395e9afc48c9))
* remove case insensitive for moddas ([b7d3336](https://github.com/loopingz/webda.io/commit/b7d333632adeb037141d54da43701a1f34ee09f5))
* remove Context reference to only use OperationContext and WebContext ([caa286d](https://github.com/loopingz/webda.io/commit/caa286d8d077ee3e4932952e34f2e80bfed0bdf3))
* remove deprecated _jsonFilter and operation checks ([8bedace](https://github.com/loopingz/webda.io/commit/8bedace7b0cb2942d4235cde72d95f08dc9ef13f))
* remove dynamic lastUpdate and creationDate ([ed9bcb3](https://github.com/loopingz/webda.io/commit/ed9bcb30691a5ff0c4c3769d572f39548c6d9b05))
* remove express and update way to manage request body ([38d8317](https://github.com/loopingz/webda.io/commit/38d8317566519d2a4f2fd47db56f7502219c13bb))
* remove idents mapper from default User class ([837ac8c](https://github.com/loopingz/webda.io/commit/837ac8c944c7cdbc030a99e37077f32c68ed0944))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))
* remove obsolete methods ([dff9a03](https://github.com/loopingz/webda.io/commit/dff9a032691094bea1d308788416a77b4279cdc7))
* rename from sql to webdaql ([67830a8](https://github.com/loopingz/webda.io/commit/67830a885a9eb8f2fe6b2ce8f48c5f415c5b2e8e))
* return this on load for CoreModel ([50d10f1](https://github.com/loopingz/webda.io/commit/50d10f19a045a7bbd73d33f5bf606e13e211ddc1))
* simplify configuration services by removing the webda node ([76487dc](https://github.com/loopingz/webda.io/commit/76487dc3fe1d8dc5f09d63f8607799799f3438b0))
* simplify OAuth event ([a554b76](https://github.com/loopingz/webda.io/commit/a554b76c6539a264cf186d50b21306112e0babbb))
* typing of Constructor ([c136978](https://github.com/loopingz/webda.io/commit/c136978becd71f63d0eb985b62d274c218b0e3b0))
* update openapi and allow @Route for service ([3163429](https://github.com/loopingz/webda.io/commit/3163429c9b3461632a0632d9c9dbb82fb0d148c2))
* update tsc messaging ([01bbb13](https://github.com/loopingz/webda.io/commit/01bbb13a0ce816c00fa2b2e7839a2e4d0300e151))
* use WebdaError instead of number for http code ([144f1f5](https://github.com/loopingz/webda.io/commit/144f1f510111048b3282524a2609c449c5bc5de7))


### Bug Fixes

* __proto__ alteration via Setter query ([d222d0f](https://github.com/loopingz/webda.io/commit/d222d0f98db38f02bf4e97b892a66200fced3d5e))
* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* @webda/shell should be local and not global ([85e3bc1](https://github.com/loopingz/webda.io/commit/85e3bc1bfe30d2b896f6eca4a4514d6e9f116c7f))
* 500 when 404 should be sent on http server ([d7dae44](https://github.com/loopingz/webda.io/commit/d7dae44b53036fd28aa82c02d857cb522ee34a9c))
* add links resolver ([c031204](https://github.com/loopingz/webda.io/commit/c03120478ba7727993064f80e27558eac759a391))
* add missing context parameter ([5c59757](https://github.com/loopingz/webda.io/commit/5c597577a3621d1cad498b346aa7ea78a8c7f013))
* add missing file ([451a9d2](https://github.com/loopingz/webda.io/commit/451a9d208acd9ad1e28295de17f3a39a4ae8235d))
* add missing files ([1f2c25e](https://github.com/loopingz/webda.io/commit/1f2c25e4f79e2dbe78190b334b4ab7e26a180446))
* add Modda to AliasStore ([9baeb4f](https://github.com/loopingz/webda.io/commit/9baeb4f58a4b4f7f55598a1ff994e59288a71eee))
* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* add type for openapi extension ([2386259](https://github.com/loopingz/webda.io/commit/23862595613a0d302cff20267542b74809e04eef))
* allow ProxyService to be overriden with empty backend ([c121ac8](https://github.com/loopingz/webda.io/commit/c121ac80e8a6588181d79e3aa7af3612748c8140))
* application module load on non-workspace project ([c788cc1](https://github.com/loopingz/webda.io/commit/c788cc1c00cf8f41ba9c5854499c579398f9bb09))
* aws test ([f351d4d](https://github.com/loopingz/webda.io/commit/f351d4d61046918e002062e8e94b58101636c7cc))
* aws unit tests ([fea780c](https://github.com/loopingz/webda.io/commit/fea780cc960945484e36f37f8833ec4742828a70))
* code coverage missing lines ([379cb58](https://github.com/loopingz/webda.io/commit/379cb588306557e23698cb6dbc6fab430b3c12f9))
* code smells ([e3ebaa5](https://github.com/loopingz/webda.io/commit/e3ebaa59235b2d4c6b175107959d7dc174ddac3e))
* code smells ([10dfe0e](https://github.com/loopingz/webda.io/commit/10dfe0e9dbc7534f7c965226fb830ecfd9218815))
* code smells ([c2dd2b0](https://github.com/loopingz/webda.io/commit/c2dd2b08ee21ec4b88ec8901820d394a99b780df))
* code smells ([00086af](https://github.com/loopingz/webda.io/commit/00086af9c1c4018fc238ee1c5126a40cc1e8c458))
* code smells and put upsert test ([0cff79a](https://github.com/loopingz/webda.io/commit/0cff79aa653885e7e5297d3eae5f3126e505c6db))
* codeql code quality issues ([81c0bfb](https://github.com/loopingz/webda.io/commit/81c0bfb8a55d1d4ebcf8ea663454e7f80acce4e0))
* codescan ([06da152](https://github.com/loopingz/webda.io/commit/06da152faa3979c2d2d38549df8093d7ceaaf82c))
* compilation issue ([810ef9a](https://github.com/loopingz/webda.io/commit/810ef9a232ffca6e873be6b16a42f83996f41f58))
* container command path ([3e4260a](https://github.com/loopingz/webda.io/commit/3e4260a073d52a778902c6fe0e8ead7c4009c042))
* content-length override ([bc40b7a](https://github.com/loopingz/webda.io/commit/bc40b7ab527b65c8e7648347a8981df6345061e0))
* context size with utf8 ([8365cef](https://github.com/loopingz/webda.io/commit/8365cef8f24fe2a8af88a947fab54db43fe452b6))
* cookie secure parameter ([70a3060](https://github.com/loopingz/webda.io/commit/70a3060e309b921beebc29a900265fcc9f17234f))
* core codecov ([4b73163](https://github.com/loopingz/webda.io/commit/4b731639f1bb3c1e33677de5607ccc3e1eb48c07))
* core test ([b1d0a67](https://github.com/loopingz/webda.io/commit/b1d0a673cc2d2de91d64b4f54f96cdc484df35f7))
* core unit tests ([cddb5c4](https://github.com/loopingz/webda.io/commit/cddb5c480057020651f3e4e4337396c979b83ca7))
* CoreModel save on instanciate model ([18b6ae8](https://github.com/loopingz/webda.io/commit/18b6ae896e2483c80d9a827eab4a679a889ae941))
* deployer namespace ([d0fbbca](https://github.com/loopingz/webda.io/commit/d0fbbca80b69add5930b43c8c4a185b45012d347))
* do not reload on cachedModule ([5add438](https://github.com/loopingz/webda.io/commit/5add438d5b9a4d28dcdca172e721fa0d7949bfc2))
* DomainService query and Host header for proxy ([73dfdce](https://github.com/loopingz/webda.io/commit/73dfdce59add5e3d43aa1a9dd4121d2353a21489))
* dynamodb and mongodb queries ([0db11c6](https://github.com/loopingz/webda.io/commit/0db11c676da03c2c18f999d8bbccd046600133ea))
* elasticsearch 8.x ([79d4750](https://github.com/loopingz/webda.io/commit/79d4750f9490ac0ee0923e6fcc00493ed3815981))
* ensure __proto__ is not used in registerOperation ([8485094](https://github.com/loopingz/webda.io/commit/8485094e5d0f2d1f64e9254c78db0cc344bbd2ec))
* es test ([7959037](https://github.com/loopingz/webda.io/commit/79590378cb43fb15d8acd0e0eabf5cf972d41df5))
* excludes list for service and container deployer ([28ce3d0](https://github.com/loopingz/webda.io/commit/28ce3d027593e16f88fb11f7218a51bd4e44a3d1))
* exit -1 if compilation fail ([f373d45](https://github.com/loopingz/webda.io/commit/f373d4589910e9066175ff538b05fb0787800c62))
* FileBinary folder ([eff3469](https://github.com/loopingz/webda.io/commit/eff346975968e64304e90e9d59e286e2dba53642))
* filebinary should expore download/upload url ([475728a](https://github.com/loopingz/webda.io/commit/475728afe36df1da9f6f9d3a2d2db71a759e144d))
* **fileconfiguration:** add filename auto-generate ([#326](https://github.com/loopingz/webda.io/issues/326)) ([ed8decf](https://github.com/loopingz/webda.io/commit/ed8decf072ae3f00b5ca1fad3caa6b76d0eac51e))
* **fileconfiguration:** add yaml support ([4dd01af](https://github.com/loopingz/webda.io/commit/4dd01af2cf5241817ef0f5adfa06b14cbbc10458))
* FileUtils finder for symlinks ([d6c20c3](https://github.com/loopingz/webda.io/commit/d6c20c39eb40abf8c0c4ac2b47b2b680afe37adc))
* FireBase query implementation ([e19c998](https://github.com/loopingz/webda.io/commit/e19c9980bdb4a2e2e45de3288e128233f191c9e4))
* force file format with JSON/YAMLUtils.saveFile ([d629ad6](https://github.com/loopingz/webda.io/commit/d629ad6ac62ae059cdec9700a48813d489316325))
* gcp firebase date management ([7ef0577](https://github.com/loopingz/webda.io/commit/7ef0577b8c87bd19d47003831d732f01d42ab9e1))
* gcp/google-auth/elasticsearch unit tests ([7fc2cd1](https://github.com/loopingz/webda.io/commit/7fc2cd18cfa44fff83900afb03588454b2110983))
* getModelHierarchy implementation ([6bd8e0e](https://github.com/loopingz/webda.io/commit/6bd8e0ee36cdd62389b413711c6a0a99ddb1cfd1))
* handle cache mishits ([1fbb8e9](https://github.com/loopingz/webda.io/commit/1fbb8e9b275bd65f4bfb9c85d117de07c0ed21b4))
* hawk move to CORSFilter ([cc33c78](https://github.com/loopingz/webda.io/commit/cc33c7835d93ac8ef77af2e4cff706023ff5137e))
* hawk unit test ([38027f7](https://github.com/loopingz/webda.io/commit/38027f762f7e52253210f5e47c6f1af0df0ca8c7))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* improve error message for unsupported diagrams ([03238b0](https://github.com/loopingz/webda.io/commit/03238b072ad3525ed463212fc77463f958259f90))
* improve session management ([3e349e6](https://github.com/loopingz/webda.io/commit/3e349e628664adbd76f312670032ffe480f41122))
* incorrect sanitization ([8feaa35](https://github.com/loopingz/webda.io/commit/8feaa3517fbf47383c3abec6bcfba4ef4006a9ac))
* keep CoreModel subclass when using put ([1f658f5](https://github.com/loopingz/webda.io/commit/1f658f5236ba39636536802275ba042b8bb37fc3))
* log display in debug mode ([e97b5c1](https://github.com/loopingz/webda.io/commit/e97b5c1ef6f299f880da5240e4b7f4c01f0f21d5))
* mapper filter ([f027480](https://github.com/loopingz/webda.io/commit/f027480651010cc81bc2b04e58c0f2b8c9eb60ad))
* missing proxy export ([f6ccd5c](https://github.com/loopingz/webda.io/commit/f6ccd5c74917a73ee0e9357b72100de83d4f2599))
* mongodb5 breaking change ([1196e88](https://github.com/loopingz/webda.io/commit/1196e8802f113ed44a3e968b14bb2edb7cd530b8))
* move unit test to checkCORSFilter ([55390fb](https://github.com/loopingz/webda.io/commit/55390fb3de642581f61e7f0915e6cdace04cf13f))
* multi-headers management ([1f9fb7d](https://github.com/loopingz/webda.io/commit/1f9fb7d1cb2f10b4a348ecaac95f66d3b850e8bc))
* OFFSET for postgres WebdaQL implementation ([d71ad3a](https://github.com/loopingz/webda.io/commit/d71ad3a08595265ab3286dbd31acb48ae4d4bb76))
* operation input verification ([b118c96](https://github.com/loopingz/webda.io/commit/b118c96fd22852f1cffe8bb8487be322279acb88))
* Operation schema may not match operation id ([e629f89](https://github.com/loopingz/webda.io/commit/e629f89ab9b7500417257397315844f846432c01))
* patch schema validation ([c76064d](https://github.com/loopingz/webda.io/commit/c76064d61b72ec2929b79fc16ec40139c8bddb04))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))
* proxy default header ([fc6a525](https://github.com/loopingz/webda.io/commit/fc6a525bea9ccf93c7e3a85e925329a02b7a17e4))
* proxy to / and cookie parameters for CookieManager ([575cc27](https://github.com/loopingz/webda.io/commit/575cc277a0fe996e27d8a3b782c085f5cfa7f249))
* read of request limit ([c8a64f5](https://github.com/loopingz/webda.io/commit/c8a64f52e78bb8c4da008b87e1cd837491494b6b))
* reinit of stream within constructor of Context ([8c138f1](https://github.com/loopingz/webda.io/commit/8c138f1fe3ee2c1f7b711072b944ee5f7a5780ff))
* remove content-length generation as it is not correct ([ba478f8](https://github.com/loopingz/webda.io/commit/ba478f879b2bce72e49df937e34444b77b689493))
* remove fs-finder from core usage ([85b122b](https://github.com/loopingz/webda.io/commit/85b122b18a9bb007e8443b19deb9d29bd023db43))
* remove module filtering for WebdaTest ([8fba48f](https://github.com/loopingz/webda.io/commit/8fba48f385344f3818a7d80e65253b18fdcdcaec))
* remove unreachable code ([2f49e55](https://github.com/loopingz/webda.io/commit/2f49e5517e232b981b85a06ed8a9d7a54d3fb169))
* router weird behavior on query string ([9421e7d](https://github.com/loopingz/webda.io/commit/9421e7d0d29f0551c9674d9367f542ed07b21cfd))
* router wildcard path - shortId ([f9b00e5](https://github.com/loopingz/webda.io/commit/f9b00e55dcec0bc1deba45d13fbefb55a046a2a4))
* sanitizer with null value ([b488a82](https://github.com/loopingz/webda.io/commit/b488a82138591a4cbd4c59cc9273aa1564c39245))
* search method should be optional ([c035620](https://github.com/loopingz/webda.io/commit/c03562093dcb9d0dc5bb8317122c5af2a846c235))
* sonar ([4f08f95](https://github.com/loopingz/webda.io/commit/4f08f951407a9f39e3ce540ea3212970af38112f))
* sonar alerts ([b61cde7](https://github.com/loopingz/webda.io/commit/b61cde739271725822afc7e00d8898827b603f6f))
* static resources for webda/shell ([291dc3b](https://github.com/loopingz/webda.io/commit/291dc3b40ab50f21c244d347af530e2e203eeca9))
* store events missing attributes ([2b032b1](https://github.com/loopingz/webda.io/commit/2b032b1e9ca9ab3e5d89caf300a9f288cbb111d8))
* store model management ([9185cd8](https://github.com/loopingz/webda.io/commit/9185cd8289a9e1bcefb492816cb42003e6acc13c))
* test masking of attribute using attributePermission ([9f6bf32](https://github.com/loopingz/webda.io/commit/9f6bf32d55385764dd7da4ac2b2ca572e3e22007))
* throw Unattached on patch method for CoreModel ([709cd8b](https://github.com/loopingz/webda.io/commit/709cd8b20d8ce699caf68b44fa3903f872f99aaa))
* touch feature based on CodeQL ([0658abe](https://github.com/loopingz/webda.io/commit/0658abe0a8bb191d320a6aab172b3db47e5eecad))
* unit test ([ee508e7](https://github.com/loopingz/webda.io/commit/ee508e784de09ddfcff70108d0f7e9a154c0f458))
* unit test and coverage ([25a5160](https://github.com/loopingz/webda.io/commit/25a5160c64592a45575460d317725ac835a6aa98))
* unit tests ([8cca312](https://github.com/loopingz/webda.io/commit/8cca312643be86577d315ea570e086cbecc23c3f))
* unused variables ([80d8310](https://github.com/loopingz/webda.io/commit/80d83108680683529654a809aed1a2627c7949ff))
* update module jsons ([5556aa5](https://github.com/loopingz/webda.io/commit/5556aa5c33ff458ee3bd4e07f32c6a5dae430c8b))
* update operationId name ([0e32796](https://github.com/loopingz/webda.io/commit/0e327962e086fe06fe18c1834b4c7ef0a9e6c10f))
* update stream read on HttpContext ([f3e35bb](https://github.com/loopingz/webda.io/commit/f3e35bbcfb68aaa8d3f14c8f8f4d19153145191b))
* use enhanced cron with cronId ([978f12d](https://github.com/loopingz/webda.io/commit/978f12dc3349eeada91afbc22bb23afdfafff38a))
* use getHostname of context on hawk ([162c1d6](https://github.com/loopingz/webda.io/commit/162c1d6e4bb8994fd20f4e128da948ecedd6587d))
* use process singleton for beans declaration ([6f93c6c](https://github.com/loopingz/webda.io/commit/6f93c6cb04676e53a80252ce3963607a42dc2aa1))
* use stream for ResourceService ([93be67f](https://github.com/loopingz/webda.io/commit/93be67fe3f2b5bfef4cbf6417919117926652216))
* use uuid instead of fixed string for put test ([bbd45ba](https://github.com/loopingz/webda.io/commit/bbd45ba5282d9fdff226b3fa56dbf474463ffa33))
* validate schema required ignore ([5d4dbe3](https://github.com/loopingz/webda.io/commit/5d4dbe3a5bb381e5f832f61d56aa961d6189a96f))
* **webdaql:** undefined value toString crash if manually set ([1b52829](https://github.com/loopingz/webda.io/commit/1b52829903e82d01251959ca96af9fd181e91a36))
* websockets module compile ([f42ed4b](https://github.com/loopingz/webda.io/commit/f42ed4b55614068bb7b4a7efc9210ce22ca3714b))
* windows path by using path.join/path.resolve ([#191](https://github.com/loopingz/webda.io/issues/191)) ([b62fe63](https://github.com/loopingz/webda.io/commit/b62fe633e018f1fb8dd9d266fc75cd619950d6ab))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped from ^3.0.1 to ^4.0.0
  * devDependencies
    * @webda/tsc-esm bumped from ^1.0.4 to ^2.0.0
</details>

<details><summary>elasticsearch: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/elasticsearch-v3.0.3...elasticsearch-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

* remove idents mapper from default User class
* use WebdaError instead of number for http code
* remove case insensitive for moddas
* remove node14 support

### Features

* add multiple increment to Store ([e6aea54](https://github.com/loopingz/webda.io/commit/e6aea54d2908e43816cd8043a0fdf209e5b04707))
* add Operations exporter code and configuration ([75ffd10](https://github.com/loopingz/webda.io/commit/75ffd1064a56f81f9df33e1babe5c10d31f2680f))
* add ProxyService ([c61a772](https://github.com/loopingz/webda.io/commit/c61a77284205c20bf12e305b6c7c88987ed62a43))
* add ref(..) to allow uid autocompletion ([de16cae](https://github.com/loopingz/webda.io/commit/de16cae506223322e4137b77b03afd4c84c22942))
* add reflections for CoreModel attributes ([7a17145](https://github.com/loopingz/webda.io/commit/7a17145f5b4495ee124931c79b77afee2031bdb7))
* add Registry and CryptoService and refactor SessionManagement ([852fe8b](https://github.com/loopingz/webda.io/commit/852fe8b076736530e18becc1479814d1cf03ccfc))
* add rotate-keys webda command ([1231fef](https://github.com/loopingz/webda.io/commit/1231fefc0ce7d26a0de5d4e72b6c5faee8b95e3c))
* add store advanced typing ([5670e4b](https://github.com/loopingz/webda.io/commit/5670e4b95fae9325dd60ad131e038eeea3c26a73))
* add websockets module ([f10642d](https://github.com/loopingz/webda.io/commit/f10642d646ebef5b5ff1c62a87c4fb28fcabfef0))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* move to es module ([2234943](https://github.com/loopingz/webda.io/commit/22349431f8241fda7a10ecdeb6563a676b935320))
* remove case insensitive for moddas ([b7d3336](https://github.com/loopingz/webda.io/commit/b7d333632adeb037141d54da43701a1f34ee09f5))
* remove idents mapper from default User class ([837ac8c](https://github.com/loopingz/webda.io/commit/837ac8c944c7cdbc030a99e37077f32c68ed0944))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))
* update reindexer for elasticsearch ([7034014](https://github.com/loopingz/webda.io/commit/70340148a3a9d7bb925dd24013322896da04d553))
* use WebdaError instead of number for http code ([144f1f5](https://github.com/loopingz/webda.io/commit/144f1f510111048b3282524a2609c449c5bc5de7))


### Bug Fixes

* add ES time-function unit test coverage ([4215dd4](https://github.com/loopingz/webda.io/commit/4215dd40b889e1f04d8bfa312affe84d4856db1e))
* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* amqp unit tests ([8d0ca6d](https://github.com/loopingz/webda.io/commit/8d0ca6dbd9e5c6a9331c3dda439788aff0701650))
* core unit tests ([cddb5c4](https://github.com/loopingz/webda.io/commit/cddb5c480057020651f3e4e4337396c979b83ca7))
* elasticsearch 8.x ([79d4750](https://github.com/loopingz/webda.io/commit/79d4750f9490ac0ee0923e6fcc00493ed3815981))
* es test ([7959037](https://github.com/loopingz/webda.io/commit/79590378cb43fb15d8acd0e0eabf5cf972d41df5))
* gcp/google-auth/elasticsearch unit tests ([7fc2cd1](https://github.com/loopingz/webda.io/commit/7fc2cd18cfa44fff83900afb03588454b2110983))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))
* remove unreachable code ([2f49e55](https://github.com/loopingz/webda.io/commit/2f49e5517e232b981b85a06ed8a9d7a54d3fb169))
* use any for ElasticSearch options ([d3e9268](https://github.com/loopingz/webda.io/commit/d3e9268b9c76353f21de509e50c701b9a5a0ebbf))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
  * devDependencies
    * @webda/shell bumped from ^3.1.0 to ^4.0.0
</details>

<details><summary>gcp: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/gcp-v3.1.0...gcp-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

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
</details>

<details><summary>google-auth: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/google-auth-v3.0.3...google-auth-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

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
</details>

<details><summary>graphql: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/graphql-v3.1.0...graphql-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

* remove dynamic lastUpdate and creationDate
* change canAct signature and create checkAct

### Features

* add binary/binaries attribute mapper ([c10be30](https://github.com/loopingz/webda.io/commit/c10be30bb8a878bc70a108d06e359978f887a539))
* add generic way to get the types for a model ([bb163e3](https://github.com/loopingz/webda.io/commit/bb163e3db7d5754c1ce457ddb930585e33e0a1a2))
* add WS proxy system ([fdc394d](https://github.com/loopingz/webda.io/commit/fdc394de666d74e9130d29fb6d4ddd67b650430f))
* change canAct signature and create checkAct ([bf09a8b](https://github.com/loopingz/webda.io/commit/bf09a8bc8ff4248661d753e75310898fbc6544b1))
* graphql module ([ef81dd5](https://github.com/loopingz/webda.io/commit/ef81dd5c948f9e56c12f6dfb055427d7ca742ca8))
* remove dynamic lastUpdate and creationDate ([ed9bcb3](https://github.com/loopingz/webda.io/commit/ed9bcb30691a5ff0c4c3769d572f39548c6d9b05))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* add links resolver ([c031204](https://github.com/loopingz/webda.io/commit/c03120478ba7727993064f80e27558eac759a391))
* **graphql:** @webda/shell dev dependency version ([b412dbc](https://github.com/loopingz/webda.io/commit/b412dbcd5ce8b8c9e08035ca116f8cd69b8bac87))
* sonar ([4f08f95](https://github.com/loopingz/webda.io/commit/4f08f951407a9f39e3ce540ea3212970af38112f))
* sonar alerts ([b61cde7](https://github.com/loopingz/webda.io/commit/b61cde739271725822afc7e00d8898827b603f6f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
  * devDependencies
    * @webda/shell bumped from ^3.1.0 to ^4.0.0
</details>

<details><summary>hawk: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/hawk-v3.0.3...hawk-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

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
</details>

<details><summary>kubernetes: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/kubernetes-v3.0.3...kubernetes-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

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
</details>

<details><summary>mongo: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/mongo-v3.1.0...mongo-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

* remove dynamic lastUpdate and creationDate
* change canAct signature and create checkAct
* remove obsolete methods
* remove case insensitive for moddas
* remove node14 support
* remove Context reference to only use OperationContext and WebContext
* typing of Constructor

### Features

* add a Cron exporter shell for @webda/kubernetes ([7a349a4](https://github.com/loopingz/webda.io/commit/7a349a430fe8dfd8a3cc3491cac00c41dc97c362))
* add alias store and queryAll method ([fe3ae81](https://github.com/loopingz/webda.io/commit/fe3ae81a1863d9498de51ff4a7ee54b6e399ef91))
* add CONTAINS operator for WebdaQL ([836093f](https://github.com/loopingz/webda.io/commit/836093f951a65dbd3d3f41443e2babea0ed7f3d9))
* add generic way to get the types for a model ([bb163e3](https://github.com/loopingz/webda.io/commit/bb163e3db7d5754c1ce457ddb930585e33e0a1a2))
* add mongodb query mapping ([d6f8b83](https://github.com/loopingz/webda.io/commit/d6f8b834471245746ad81c11bd7314a75e1b40d9))
* add multiple increment to Store ([e6aea54](https://github.com/loopingz/webda.io/commit/e6aea54d2908e43816cd8043a0fdf209e5b04707))
* add Operations exporter code and configuration ([75ffd10](https://github.com/loopingz/webda.io/commit/75ffd1064a56f81f9df33e1babe5c10d31f2680f))
* add ORDER BY clause ([5ae1cc0](https://github.com/loopingz/webda.io/commit/5ae1cc0688cc86d8aa294088f03980543a4d81d7))
* add ref(..) to allow uid autocompletion ([de16cae](https://github.com/loopingz/webda.io/commit/de16cae506223322e4137b77b03afd4c84c22942))
* add reflections for CoreModel attributes ([7a17145](https://github.com/loopingz/webda.io/commit/7a17145f5b4495ee124931c79b77afee2031bdb7))
* add WS proxy system ([fdc394d](https://github.com/loopingz/webda.io/commit/fdc394de666d74e9130d29fb6d4ddd67b650430f))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* change canAct signature and create checkAct ([bf09a8b](https://github.com/loopingz/webda.io/commit/bf09a8bc8ff4248661d753e75310898fbc6544b1))
* graphql module ([ef81dd5](https://github.com/loopingz/webda.io/commit/ef81dd5c948f9e56c12f6dfb055427d7ca742ca8))
* move to es module ([2234943](https://github.com/loopingz/webda.io/commit/22349431f8241fda7a10ecdeb6563a676b935320))
* remove case insensitive for moddas ([b7d3336](https://github.com/loopingz/webda.io/commit/b7d333632adeb037141d54da43701a1f34ee09f5))
* remove Context reference to only use OperationContext and WebContext ([caa286d](https://github.com/loopingz/webda.io/commit/caa286d8d077ee3e4932952e34f2e80bfed0bdf3))
* remove dynamic lastUpdate and creationDate ([ed9bcb3](https://github.com/loopingz/webda.io/commit/ed9bcb30691a5ff0c4c3769d572f39548c6d9b05))
* remove express and update way to manage request body ([38d8317](https://github.com/loopingz/webda.io/commit/38d8317566519d2a4f2fd47db56f7502219c13bb))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))
* remove obsolete methods ([dff9a03](https://github.com/loopingz/webda.io/commit/dff9a032691094bea1d308788416a77b4279cdc7))
* typing of Constructor ([c136978](https://github.com/loopingz/webda.io/commit/c136978becd71f63d0eb985b62d274c218b0e3b0))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* add links resolver ([c031204](https://github.com/loopingz/webda.io/commit/c03120478ba7727993064f80e27558eac759a391))
* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* code smells and put upsert test ([0cff79a](https://github.com/loopingz/webda.io/commit/0cff79aa653885e7e5297d3eae5f3126e505c6db))
* core unit tests ([cddb5c4](https://github.com/loopingz/webda.io/commit/cddb5c480057020651f3e4e4337396c979b83ca7))
* dynamodb and mongodb queries ([0db11c6](https://github.com/loopingz/webda.io/commit/0db11c676da03c2c18f999d8bbccd046600133ea))
* FileBinary folder ([eff3469](https://github.com/loopingz/webda.io/commit/eff346975968e64304e90e9d59e286e2dba53642))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* mongodb unit tests ([3b33c91](https://github.com/loopingz/webda.io/commit/3b33c915d76d827adb41346d87afb1dbdb825ae1))
* mongodb webda.module.json update ([3cba5e4](https://github.com/loopingz/webda.io/commit/3cba5e49a89789d6301be52c4c9c3f1fd2cd2db8))
* mongodb5 breaking change ([1196e88](https://github.com/loopingz/webda.io/commit/1196e8802f113ed44a3e968b14bb2edb7cd530b8))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))
* remove unreachable code ([2f49e55](https://github.com/loopingz/webda.io/commit/2f49e5517e232b981b85a06ed8a9d7a54d3fb169))
* unit test and coverage ([25a5160](https://github.com/loopingz/webda.io/commit/25a5160c64592a45575460d317725ac835a6aa98))
* update module jsons ([5556aa5](https://github.com/loopingz/webda.io/commit/5556aa5c33ff458ee3bd4e07f32c6a5dae430c8b))
* use enhanced cron with cronId ([978f12d](https://github.com/loopingz/webda.io/commit/978f12dc3349eeada91afbc22bb23afdfafff38a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
  * devDependencies
    * @webda/shell bumped from ^3.1.0 to ^4.0.0
</details>

<details><summary>postgres: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/postgres-v3.0.3...postgres-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

* change canAct signature and create checkAct
* use WebdaError instead of number for http code
* remove obsolete methods
* remove case insensitive for moddas
* remove node14 support

### Features

* add a Cron exporter shell for @webda/kubernetes ([7a349a4](https://github.com/loopingz/webda.io/commit/7a349a430fe8dfd8a3cc3491cac00c41dc97c362))
* add alias store and queryAll method ([fe3ae81](https://github.com/loopingz/webda.io/commit/fe3ae81a1863d9498de51ff4a7ee54b6e399ef91))
* add CONTAINS operator for WebdaQL ([836093f](https://github.com/loopingz/webda.io/commit/836093f951a65dbd3d3f41443e2babea0ed7f3d9))
* add generic way to get the types for a model ([bb163e3](https://github.com/loopingz/webda.io/commit/bb163e3db7d5754c1ce457ddb930585e33e0a1a2))
* add multiple increment to Store ([e6aea54](https://github.com/loopingz/webda.io/commit/e6aea54d2908e43816cd8043a0fdf209e5b04707))
* add Operations exporter code and configuration ([75ffd10](https://github.com/loopingz/webda.io/commit/75ffd1064a56f81f9df33e1babe5c10d31f2680f))
* add ORDER BY clause ([5ae1cc0](https://github.com/loopingz/webda.io/commit/5ae1cc0688cc86d8aa294088f03980543a4d81d7))
* add ProxyService ([c61a772](https://github.com/loopingz/webda.io/commit/c61a77284205c20bf12e305b6c7c88987ed62a43))
* add query mapper for SQL ([a1bf776](https://github.com/loopingz/webda.io/commit/a1bf7766f3f078bf5e9c126376b6f00508c82c53))
* add ref(..) to allow uid autocompletion ([de16cae](https://github.com/loopingz/webda.io/commit/de16cae506223322e4137b77b03afd4c84c22942))
* add reflections for CoreModel attributes ([7a17145](https://github.com/loopingz/webda.io/commit/7a17145f5b4495ee124931c79b77afee2031bdb7))
* add Registry and CryptoService and refactor SessionManagement ([852fe8b](https://github.com/loopingz/webda.io/commit/852fe8b076736530e18becc1479814d1cf03ccfc))
* add store advanced typing ([5670e4b](https://github.com/loopingz/webda.io/commit/5670e4b95fae9325dd60ad131e038eeea3c26a73))
* add trusted proxies and full uuid on coremodel ([cdd0435](https://github.com/loopingz/webda.io/commit/cdd043585da9a0c19b1b95c800ec10444b4fd721))
* add websockets module ([f10642d](https://github.com/loopingz/webda.io/commit/f10642d646ebef5b5ff1c62a87c4fb28fcabfef0))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* change canAct signature and create checkAct ([bf09a8b](https://github.com/loopingz/webda.io/commit/bf09a8bc8ff4248661d753e75310898fbc6544b1))
* move to es module ([2234943](https://github.com/loopingz/webda.io/commit/22349431f8241fda7a10ecdeb6563a676b935320))
* remove case insensitive for moddas ([b7d3336](https://github.com/loopingz/webda.io/commit/b7d333632adeb037141d54da43701a1f34ee09f5))
* remove express and update way to manage request body ([38d8317](https://github.com/loopingz/webda.io/commit/38d8317566519d2a4f2fd47db56f7502219c13bb))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))
* remove obsolete methods ([dff9a03](https://github.com/loopingz/webda.io/commit/dff9a032691094bea1d308788416a77b4279cdc7))
* rename from sql to webdaql ([67830a8](https://github.com/loopingz/webda.io/commit/67830a885a9eb8f2fe6b2ce8f48c5f415c5b2e8e))
* use WebdaError instead of number for http code ([144f1f5](https://github.com/loopingz/webda.io/commit/144f1f510111048b3282524a2609c449c5bc5de7))


### Bug Fixes

* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* core unit tests ([cddb5c4](https://github.com/loopingz/webda.io/commit/cddb5c480057020651f3e4e4337396c979b83ca7))
* FileBinary folder ([eff3469](https://github.com/loopingz/webda.io/commit/eff346975968e64304e90e9d59e286e2dba53642))
* gcp firebase date management ([7ef0577](https://github.com/loopingz/webda.io/commit/7ef0577b8c87bd19d47003831d732f01d42ab9e1))
* hawk unit test ([5f2adc6](https://github.com/loopingz/webda.io/commit/5f2adc6a1d55bcac370f46b518148b90ac151efc))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* OFFSET for postgres WebdaQL implementation ([d71ad3a](https://github.com/loopingz/webda.io/commit/d71ad3a08595265ab3286dbd31acb48ae4d4bb76))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))
* remove unreachable code ([2f49e55](https://github.com/loopingz/webda.io/commit/2f49e5517e232b981b85a06ed8a9d7a54d3fb169))
* **shell:** json-schema generation post update 1.1 ([fb2e6ca](https://github.com/loopingz/webda.io/commit/fb2e6ca55ff5e744561082096cfdd82782b4cb1c))
* unit test and coverage ([25a5160](https://github.com/loopingz/webda.io/commit/25a5160c64592a45575460d317725ac835a6aa98))
* update module jsons ([5556aa5](https://github.com/loopingz/webda.io/commit/5556aa5c33ff458ee3bd4e07f32c6a5dae430c8b))
* use enhanced cron with cronId ([978f12d](https://github.com/loopingz/webda.io/commit/978f12dc3349eeada91afbc22bb23afdfafff38a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
  * devDependencies
    * @webda/shell bumped from ^3.1.0 to ^4.0.0
</details>

<details><summary>profiler: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/profiler-v3.0.3...profiler-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

* remove case insensitive for moddas
* remove node14 support

### Features

* add factory and permission query ([68ee7e9](https://github.com/loopingz/webda.io/commit/68ee7e92b0e0747b9ca1d796fcfb25919a5b58b2))
* add Operations exporter code and configuration ([75ffd10](https://github.com/loopingz/webda.io/commit/75ffd1064a56f81f9df33e1babe5c10d31f2680f))
* add ProxyService ([c61a772](https://github.com/loopingz/webda.io/commit/c61a77284205c20bf12e305b6c7c88987ed62a43))
* add ref(..) to allow uid autocompletion ([de16cae](https://github.com/loopingz/webda.io/commit/de16cae506223322e4137b77b03afd4c84c22942))
* add reflections for CoreModel attributes ([7a17145](https://github.com/loopingz/webda.io/commit/7a17145f5b4495ee124931c79b77afee2031bdb7))
* add Registry and CryptoService and refactor SessionManagement ([852fe8b](https://github.com/loopingz/webda.io/commit/852fe8b076736530e18becc1479814d1cf03ccfc))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* move to es module ([2234943](https://github.com/loopingz/webda.io/commit/22349431f8241fda7a10ecdeb6563a676b935320))
* remove case insensitive for moddas ([b7d3336](https://github.com/loopingz/webda.io/commit/b7d333632adeb037141d54da43701a1f34ee09f5))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))


### Bug Fixes

* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* amqp unit tests ([8d0ca6d](https://github.com/loopingz/webda.io/commit/8d0ca6dbd9e5c6a9331c3dda439788aff0701650))
* core unit tests ([cddb5c4](https://github.com/loopingz/webda.io/commit/cddb5c480057020651f3e4e4337396c979b83ca7))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))
* unit test and coverage ([25a5160](https://github.com/loopingz/webda.io/commit/25a5160c64592a45575460d317725ac835a6aa98))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
  * devDependencies
    * @webda/shell bumped from ^3.1.0 to ^4.0.0
</details>

<details><summary>profiler-aws-xray: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/profiler-aws-xray-v3.0.3...profiler-aws-xray-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

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
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))


### Bug Fixes

* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* code smells and put upsert test ([0cff79a](https://github.com/loopingz/webda.io/commit/0cff79aa653885e7e5297d3eae5f3126e505c6db))
* core unit tests ([cddb5c4](https://github.com/loopingz/webda.io/commit/cddb5c480057020651f3e4e4337396c979b83ca7))
* elasticsearch 8.x ([79d4750](https://github.com/loopingz/webda.io/commit/79d4750f9490ac0ee0923e6fcc00493ed3815981))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
  * devDependencies
    * @webda/shell bumped from ^3.1.0 to ^4.0.0
</details>

<details><summary>shell: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/shell-v3.1.0...shell-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

* remove idents mapper from default User class
* move Binary to BinaryService
* remove dynamic lastUpdate and creationDate
* change canAct signature and create checkAct
* use WebdaError instead of number for http code
* remove obsolete methods
* remove case insensitive for moddas
* move fullUuid to __type$uuid
* refactor Context provider and models analysis
* remove node14 support
* remove Context reference to only use OperationContext and WebContext
* typing of Constructor

### Features

* add @Action annotation for CoreModel action ([7797e88](https://github.com/loopingz/webda.io/commit/7797e88004a658d67661b287ee9de339d3673a66))
* add a --watcher option to build ([e98b4f7](https://github.com/loopingz/webda.io/commit/e98b4f7f2438655cfcaa13e70351337ac570bc8a))
* add a Cron exporter shell for @webda/kubernetes ([7a349a4](https://github.com/loopingz/webda.io/commit/7a349a430fe8dfd8a3cc3491cac00c41dc97c362))
* add alias store and queryAll method ([fe3ae81](https://github.com/loopingz/webda.io/commit/fe3ae81a1863d9498de51ff4a7ee54b6e399ef91))
* add args spreader for cron commandline ([2a972e2](https://github.com/loopingz/webda.io/commit/2a972e2afd6acb024ea43dd7fe3852f024ce9abf))
* add asyncoperationaction ([6f86c17](https://github.com/loopingz/webda.io/commit/6f86c17d174c5ddc94563ba9b9ab973e8f4bb17f))
* add CONTAINS operator for WebdaQL ([836093f](https://github.com/loopingz/webda.io/commit/836093f951a65dbd3d3f41443e2babea0ed7f3d9))
* add environment access for deployer variables ([9733085](https://github.com/loopingz/webda.io/commit/9733085d76bc48acb5252720a1ebe7d1ecb73c1d))
* add factory and permission query ([68ee7e9](https://github.com/loopingz/webda.io/commit/68ee7e92b0e0747b9ca1d796fcfb25919a5b58b2))
* add generic way to get the types for a model ([bb163e3](https://github.com/loopingz/webda.io/commit/bb163e3db7d5754c1ce457ddb930585e33e0a1a2))
* add getClientIp on HttpContext ([512bebc](https://github.com/loopingz/webda.io/commit/512bebc3318c933bfaa952ca23779b63c5e7322a))
* add hawk ip whitelist ([171b699](https://github.com/loopingz/webda.io/commit/171b69925629aff9cf5ae304a93bc3597abbe153))
* add imports feature in Configuration ([eb4dbe6](https://github.com/loopingz/webda.io/commit/eb4dbe62d331fa29010bf10d82d87bebb404b3b9))
* add launcher customization ([37642a6](https://github.com/loopingz/webda.io/commit/37642a680234b505049c97d4814ef677bb5f03e5))
* add models export feature and shortIds ([bc20e1a](https://github.com/loopingz/webda.io/commit/bc20e1a4ef0aca8c503b18633e1ebb790d0656d9))
* add more jsdoc annotation for schema ([11bec35](https://github.com/loopingz/webda.io/commit/11bec35c8a6dda1d87aa3d745fdb3d2a1dcb2692))
* add multiple increment to Store ([e6aea54](https://github.com/loopingz/webda.io/commit/e6aea54d2908e43816cd8043a0fdf209e5b04707))
* add Operations exporter code and configuration ([75ffd10](https://github.com/loopingz/webda.io/commit/75ffd1064a56f81f9df33e1babe5c10d31f2680f))
* add ORDER BY clause ([5ae1cc0](https://github.com/loopingz/webda.io/commit/5ae1cc0688cc86d8aa294088f03980543a4d81d7))
* add output type generation for Operation ([426d524](https://github.com/loopingz/webda.io/commit/426d524c96eb8800fa3fa17d3330782b7fa32633))
* add Proxy on CoreModel ([845c7b9](https://github.com/loopingz/webda.io/commit/845c7b91d6704ed07cb17a8ee17ac50878b9880c))
* add ProxyService ([c61a772](https://github.com/loopingz/webda.io/commit/c61a77284205c20bf12e305b6c7c88987ed62a43))
* add putRedirectUrl for Google Storage ([ec03b09](https://github.com/loopingz/webda.io/commit/ec03b0900bff3ed6208abd4e358f401d08657131))
* add ref(..) to allow uid autocompletion ([de16cae](https://github.com/loopingz/webda.io/commit/de16cae506223322e4137b77b03afd4c84c22942))
* add reflections for CoreModel attributes ([7a17145](https://github.com/loopingz/webda.io/commit/7a17145f5b4495ee124931c79b77afee2031bdb7))
* add Registry and CryptoService and refactor SessionManagement ([852fe8b](https://github.com/loopingz/webda.io/commit/852fe8b076736530e18becc1479814d1cf03ccfc))
* add relations definition ([7184bc0](https://github.com/loopingz/webda.io/commit/7184bc0e6bebb1b251a07337cb5587d383c97c6a))
* add resource file only serve ([2e49555](https://github.com/loopingz/webda.io/commit/2e49555b0a52aa5ab41c4077df37684993ac156d))
* add rotate-keys webda command ([1231fef](https://github.com/loopingz/webda.io/commit/1231fefc0ce7d26a0de5d4e72b6c5faee8b95e3c))
* add smart compilation for webda binary ([48e17ed](https://github.com/loopingz/webda.io/commit/48e17eda613b171ccb240950e167fe3c806ee78f)), closes [#402](https://github.com/loopingz/webda.io/issues/402)
* add specific schema exporter for relations ([9b67109](https://github.com/loopingz/webda.io/commit/9b6710902168276e34a0c913080a1e749e758f37))
* add storage diagram generation ([ab5256b](https://github.com/loopingz/webda.io/commit/ab5256b2de5dee37deec13690b883844227717e2))
* add store advanced typing ([5670e4b](https://github.com/loopingz/webda.io/commit/5670e4b95fae9325dd60ad131e038eeea3c26a73))
* add store export command and fix yargs extension for webda.shell.json ([1027282](https://github.com/loopingz/webda.io/commit/10272828d7119be2f93abe09284bfd9fe23518f5))
* add Store migration and refactors ([9d3a8dc](https://github.com/loopingz/webda.io/commit/9d3a8dc45c13fdd8c7293f2c3d1c54304aeb261f))
* add trusted proxies and full uuid on coremodel ([cdd0435](https://github.com/loopingz/webda.io/commit/cdd043585da9a0c19b1b95c800ec10444b4fd721))
* add WebdaSchema to create schema from interface or class ([9a45be4](https://github.com/loopingz/webda.io/commit/9a45be40c76c5fd5b7c26da58b7d9bd19dddf180))
* add websockets module ([f10642d](https://github.com/loopingz/webda.io/commit/f10642d646ebef5b5ff1c62a87c4fb28fcabfef0))
* add WS proxy system ([fdc394d](https://github.com/loopingz/webda.io/commit/fdc394de666d74e9130d29fb6d4ddd67b650430f))
* allow additional JSDocs on schema generation ([0eaee71](https://github.com/loopingz/webda.io/commit/0eaee71aba508d4c48263a49d8a9947b5b58e5f9))
* allow other command than serve in webda debug ([65e8751](https://github.com/loopingz/webda.io/commit/65e875111c817a70847993b2d014f15eb923bf17))
* allow redirect from checkRequest ([e88bd69](https://github.com/loopingz/webda.io/commit/e88bd6953f962a47734b4a3c68e1ecba10843076))
* allow redirect with WebdaError.Redirect ([499432e](https://github.com/loopingz/webda.io/commit/499432edd2bc9b542d7551b398a8b32648f04c4e))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* allow two types of request filter (CORS and normal) ([cecfc0b](https://github.com/loopingz/webda.io/commit/cecfc0b4b5df76a32c2a3f1de3980e71c672d0fc))
* allow usage of lowercase log level ([6e8efdb](https://github.com/loopingz/webda.io/commit/6e8efdbbdfee1cbe1bcb04e9daf17a4aab89ae1f))
* change canAct signature and create checkAct ([bf09a8b](https://github.com/loopingz/webda.io/commit/bf09a8bc8ff4248661d753e75310898fbc6544b1))
* emit a Webda.Init.Http when http server is ready ([5513a21](https://github.com/loopingz/webda.io/commit/5513a214ed46ab7cf43ce0ae8e364e72a1333725))
* ensure checkRequest return at least true ([68d7fc3](https://github.com/loopingz/webda.io/commit/68d7fc3340197915180acea5711d4d9c6e5d9fef))
* exclude node_modules/.cache/nx from findModules ([5900e4d](https://github.com/loopingz/webda.io/commit/5900e4d4f736a64d059a7540e048d57f05d2125a))
* improve FileUtils walk and find ([d4d006b](https://github.com/loopingz/webda.io/commit/d4d006b6fec0ba41766e4ae69674e3a971e4b67d))
* improve openapi quality ([18bb96e](https://github.com/loopingz/webda.io/commit/18bb96e60edd7dcb9ce81c2f37ba484b56ce7dc9))
* move Binary to BinaryService ([9db461b](https://github.com/loopingz/webda.io/commit/9db461b994db617b443aa2606b8b64d9c7a49a69))
* move fullUuid to __type$uuid ([1fea719](https://github.com/loopingz/webda.io/commit/1fea719ccb839413048abea4f04dfcc5daa7b2ff))
* move to es module ([2234943](https://github.com/loopingz/webda.io/commit/22349431f8241fda7a10ecdeb6563a676b935320))
* move to radix 36 for keyid ([fad03e3](https://github.com/loopingz/webda.io/commit/fad03e3085fa383efe086d40f11130b30d8c0b8c))
* Operation annotation registration ([6652f5a](https://github.com/loopingz/webda.io/commit/6652f5af75b466b90ff0706abdf2e4a7a08ef318))
* refactor Context provider and models analysis ([f035f44](https://github.com/loopingz/webda.io/commit/f035f4459b3237020901deb8e283395e9afc48c9))
* remove case insensitive for moddas ([b7d3336](https://github.com/loopingz/webda.io/commit/b7d333632adeb037141d54da43701a1f34ee09f5))
* remove Context reference to only use OperationContext and WebContext ([caa286d](https://github.com/loopingz/webda.io/commit/caa286d8d077ee3e4932952e34f2e80bfed0bdf3))
* remove dynamic lastUpdate and creationDate ([ed9bcb3](https://github.com/loopingz/webda.io/commit/ed9bcb30691a5ff0c4c3769d572f39548c6d9b05))
* remove express and update way to manage request body ([38d8317](https://github.com/loopingz/webda.io/commit/38d8317566519d2a4f2fd47db56f7502219c13bb))
* remove idents mapper from default User class ([837ac8c](https://github.com/loopingz/webda.io/commit/837ac8c944c7cdbc030a99e37077f32c68ed0944))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))
* remove obsolete methods ([dff9a03](https://github.com/loopingz/webda.io/commit/dff9a032691094bea1d308788416a77b4279cdc7))
* typing of Constructor ([c136978](https://github.com/loopingz/webda.io/commit/c136978becd71f63d0eb985b62d274c218b0e3b0))
* update tsc messaging ([01bbb13](https://github.com/loopingz/webda.io/commit/01bbb13a0ce816c00fa2b2e7839a2e4d0300e151))
* use WebdaError instead of number for http code ([144f1f5](https://github.com/loopingz/webda.io/commit/144f1f510111048b3282524a2609c449c5bc5de7))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* @webda/shell should be local and not global ([85e3bc1](https://github.com/loopingz/webda.io/commit/85e3bc1bfe30d2b896f6eca4a4514d6e9f116c7f))
* 500 when 404 should be sent on http server ([d7dae44](https://github.com/loopingz/webda.io/commit/d7dae44b53036fd28aa82c02d857cb522ee34a9c))
* add devMode for websockets authorizer ([6b3f2c0](https://github.com/loopingz/webda.io/commit/6b3f2c036de94cef257a0d75bd8d1737e7cc64ba))
* add direct dependency dateformat to @webda/shell ([dbedcd1](https://github.com/loopingz/webda.io/commit/dbedcd115da3143205bc40e4a06de20e58695289))
* add links resolver ([c031204](https://github.com/loopingz/webda.io/commit/c03120478ba7727993064f80e27558eac759a391))
* add missing dependencies ([189863f](https://github.com/loopingz/webda.io/commit/189863fcd18f27295eb4630febe7cf852dcc12e8))
* add missing dependencies for pnpm/bazel ([1ec04a3](https://github.com/loopingz/webda.io/commit/1ec04a375998ee7a7a00ea03c30a2960b7778d6b))
* add missing module for @webda/shell ([8f8c06d](https://github.com/loopingz/webda.io/commit/8f8c06d96564b76d5f366edc5f43bac2a6096ac7))
* add openapi option back ([250dccc](https://github.com/loopingz/webda.io/commit/250dcccfaeb665014eb5c4399210682fa06bfb49))
* add placeholder for bin ([22ec4e1](https://github.com/loopingz/webda.io/commit/22ec4e10980924d82935567df6e3440b16497ed9))
* add SchemaIgnore JSDoc ([0e774e2](https://github.com/loopingz/webda.io/commit/0e774e2fc2ee13df730e6be29f36f37e5ffd02a3))
* avoid workspace root control ([fcca657](https://github.com/loopingz/webda.io/commit/fcca657cecb514ab86e9c23e75efb4dfd0d867c8))
* aws unit tests ([fea780c](https://github.com/loopingz/webda.io/commit/fea780cc960945484e36f37f8833ec4742828a70))
* buildah/podman do not like stdin pipe from nodejs ([0a76e5e](https://github.com/loopingz/webda.io/commit/0a76e5e8d6ba6e29ea8dd201092ab17c5136f632))
* code coverage missing lines ([379cb58](https://github.com/loopingz/webda.io/commit/379cb588306557e23698cb6dbc6fab430b3c12f9))
* code smells ([e3ebaa5](https://github.com/loopingz/webda.io/commit/e3ebaa59235b2d4c6b175107959d7dc174ddac3e))
* code smells ([10dfe0e](https://github.com/loopingz/webda.io/commit/10dfe0e9dbc7534f7c965226fb830ecfd9218815))
* code smells ([c2dd2b0](https://github.com/loopingz/webda.io/commit/c2dd2b08ee21ec4b88ec8901820d394a99b780df))
* code smells ([00086af](https://github.com/loopingz/webda.io/commit/00086af9c1c4018fc238ee1c5126a40cc1e8c458))
* code smells and put upsert test ([0cff79a](https://github.com/loopingz/webda.io/commit/0cff79aa653885e7e5297d3eae5f3126e505c6db))
* compilation issue ([08f51f3](https://github.com/loopingz/webda.io/commit/08f51f34a253a111325cbcb517362fa818da3c5a))
* container command path ([3e4260a](https://github.com/loopingz/webda.io/commit/3e4260a073d52a778902c6fe0e8ead7c4009c042))
* container deployer jsonc configuration inclusion ([b251244](https://github.com/loopingz/webda.io/commit/b2512441ddc31b10cb235c11dba0e0aaec89e4fc))
* content-length override ([bc40b7a](https://github.com/loopingz/webda.io/commit/bc40b7ab527b65c8e7648347a8981df6345061e0))
* core unit tests ([cddb5c4](https://github.com/loopingz/webda.io/commit/cddb5c480057020651f3e4e4337396c979b83ca7))
* debug with websockets enabled ([647f37e](https://github.com/loopingz/webda.io/commit/647f37ea5dda47e00484d3c4b38903d3f65eb4e9))
* deployer namespace ([d0fbbca](https://github.com/loopingz/webda.io/commit/d0fbbca80b69add5930b43c8c4a185b45012d347))
* do not reload on cachedModule ([5add438](https://github.com/loopingz/webda.io/commit/5add438d5b9a4d28dcdca172e721fa0d7949bfc2))
* DomainService query and Host header for proxy ([73dfdce](https://github.com/loopingz/webda.io/commit/73dfdce59add5e3d43aa1a9dd4121d2353a21489))
* elasticsearch 8.x ([79d4750](https://github.com/loopingz/webda.io/commit/79d4750f9490ac0ee0923e6fcc00493ed3815981))
* empty input operation ([588a54c](https://github.com/loopingz/webda.io/commit/588a54c236dad3f57e143c344778bd6a4b9185aa))
* excludes list for service and container deployer ([28ce3d0](https://github.com/loopingz/webda.io/commit/28ce3d027593e16f88fb11f7218a51bd4e44a3d1))
* exit -1 if compilation fail ([f373d45](https://github.com/loopingz/webda.io/commit/f373d4589910e9066175ff538b05fb0787800c62))
* FileBinary folder ([eff3469](https://github.com/loopingz/webda.io/commit/eff346975968e64304e90e9d59e286e2dba53642))
* full cov ([c4375ed](https://github.com/loopingz/webda.io/commit/c4375ed864fd4021dfd10b8bbceb7c608d66fdee))
* gcp/google-auth/elasticsearch unit tests ([7fc2cd1](https://github.com/loopingz/webda.io/commit/7fc2cd18cfa44fff83900afb03588454b2110983))
* getModelHierarchy implementation ([6bd8e0e](https://github.com/loopingz/webda.io/commit/6bd8e0ee36cdd62389b413711c6a0a99ddb1cfd1))
* hang when header are sent twice ([6fd394a](https://github.com/loopingz/webda.io/commit/6fd394a14db7e54614a3ac7bc4ce755900c65979))
* hawk move to CORSFilter ([cc33c78](https://github.com/loopingz/webda.io/commit/cc33c7835d93ac8ef77af2e4cff706023ff5137e))
* hawk unit test ([38027f7](https://github.com/loopingz/webda.io/commit/38027f762f7e52253210f5e47c6f1af0df0ca8c7))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* improve error message for unsupported diagrams ([03238b0](https://github.com/loopingz/webda.io/commit/03238b072ad3525ed463212fc77463f958259f90))
* launcher unit test ([6f2ef59](https://github.com/loopingz/webda.io/commit/6f2ef592973c442c1488a572778111a1c99489cd))
* log display in debug mode ([e97b5c1](https://github.com/loopingz/webda.io/commit/e97b5c1ef6f299f880da5240e4b7f4c01f0f21d5))
* multi-headers management ([1f9fb7d](https://github.com/loopingz/webda.io/commit/1f9fb7d1cb2f10b4a348ecaac95f66d3b850e8bc))
* operation input verification ([b118c96](https://github.com/loopingz/webda.io/commit/b118c96fd22852f1cffe8bb8487be322279acb88))
* patch schema validation ([c76064d](https://github.com/loopingz/webda.io/commit/c76064d61b72ec2929b79fc16ec40139c8bddb04))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))
* prevent add deployers to cachedModule ([8aba3cb](https://github.com/loopingz/webda.io/commit/8aba3cb7179132ec1ac860e177795e395dbf565c))
* prevent failure on Github actions for v16 ([42febc7](https://github.com/loopingz/webda.io/commit/42febc74e0e70c46f377dcfb7fc675f8c70fba58))
* readd missing cov ignore ([aed7524](https://github.com/loopingz/webda.io/commit/aed7524a58e2a2d226ac093e8609cc0b3c29874d))
* readd the missing deploy ([7650364](https://github.com/loopingz/webda.io/commit/7650364ede976b4489f38e3ea7d2cfa6e49d4874))
* reinit of stream within constructor of Context ([8c138f1](https://github.com/loopingz/webda.io/commit/8c138f1fe3ee2c1f7b711072b944ee5f7a5780ff))
* relax client read typing for kubernetes node client ([65f7c23](https://github.com/loopingz/webda.io/commit/65f7c23825653cddf2307da8d036a4caa9fe93c7))
* remove packaged marker system ([8cea303](https://github.com/loopingz/webda.io/commit/8cea30367b76c7e77a97752d8606b4bc88aadf69))
* remove unreachable code ([2f49e55](https://github.com/loopingz/webda.io/commit/2f49e5517e232b981b85a06ed8a9d7a54d3fb169))
* router weird behavior on query string ([9421e7d](https://github.com/loopingz/webda.io/commit/9421e7d0d29f0551c9674d9367f542ed07b21cfd))
* router wildcard path - shortId ([f9b00e5](https://github.com/loopingz/webda.io/commit/f9b00e55dcec0bc1deba45d13fbefb55a046a2a4))
* shell extension in workspace project ([f22fd37](https://github.com/loopingz/webda.io/commit/f22fd37be9562d8b507eb36f979a3f2c6ad2609c))
* shell unit tests ([9df941a](https://github.com/loopingz/webda.io/commit/9df941abc1d32bf2be1b37f5f92123928311082d))
* **shell:** json-schema generation post update 1.1 ([fb2e6ca](https://github.com/loopingz/webda.io/commit/fb2e6ca55ff5e744561082096cfdd82782b4cb1c))
* should not check CORS if no origin is set ([6cf59a1](https://github.com/loopingz/webda.io/commit/6cf59a17e7a2cfffc98356a89ec7b778f079f26e))
* sonar ([4f08f95](https://github.com/loopingz/webda.io/commit/4f08f951407a9f39e3ce540ea3212970af38112f))
* static resources for webda/shell ([291dc3b](https://github.com/loopingz/webda.io/commit/291dc3b40ab50f21c244d347af530e2e203eeca9))
* transfer GIT_INFO to container when deploying ([151c88c](https://github.com/loopingz/webda.io/commit/151c88cdac2bf80d4d4ca9155899da00f9c7ec49))
* tsc-esm library export to avoid double compilation ([eb0022c](https://github.com/loopingz/webda.io/commit/eb0022c091a60982009df25cd1905479320bb5ab))
* unit test and coverage ([25a5160](https://github.com/loopingz/webda.io/commit/25a5160c64592a45575460d317725ac835a6aa98))
* unit test for webda-shell ([4622109](https://github.com/loopingz/webda.io/commit/4622109d17cdeb8a9e7dadb386fb0d950b3e46b5))
* unit tests ([8cca312](https://github.com/loopingz/webda.io/commit/8cca312643be86577d315ea570e086cbecc23c3f))
* update module jsons ([5556aa5](https://github.com/loopingz/webda.io/commit/5556aa5c33ff458ee3bd4e07f32c6a5dae430c8b))
* update stream read on HttpContext ([f3e35bb](https://github.com/loopingz/webda.io/commit/f3e35bbcfb68aaa8d3f14c8f8f4d19153145191b))
* upgrade iam-policy-optimizer to remove aws-sdk dep ([3da4251](https://github.com/loopingz/webda.io/commit/3da4251c88f168d6cc9c9d83943dcf28158175c4))
* use enhanced cron with cronId ([978f12d](https://github.com/loopingz/webda.io/commit/978f12dc3349eeada91afbc22bb23afdfafff38a))
* validate schema required ignore ([5d4dbe3](https://github.com/loopingz/webda.io/commit/5d4dbe3a5bb381e5f832f61d56aa961d6189a96f))
* webda/core resolution ([58970d6](https://github.com/loopingz/webda.io/commit/58970d67ad6ab611e6dd7ac261376bcc3a1faf7c))
* webservers socket.io system ([39100bc](https://github.com/loopingz/webda.io/commit/39100bca230cffd880a644c20106204b3a27d69a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^4.0.0
    * @webda/kubernetes bumped from ^3.0.3 to ^4.0.0
    * @webda/tsc-esm bumped from ^1.0.4 to ^2.0.0
    * @webda/workout bumped from ^3.0.1 to ^4.0.0
</details>

<details><summary>tsc-esm: 2.0.0</summary>

## [2.0.0](https://github.com/loopingz/webda.io/compare/tsc-esm-v1.0.4...tsc-esm-v2.0.0) (2023-06-30)


###   BREAKING CHANGES

* move Binary to BinaryService
* simplify configuration services by removing the webda node
* change canAct signature and create checkAct

### Features

* change canAct signature and create checkAct ([bf09a8b](https://github.com/loopingz/webda.io/commit/bf09a8bc8ff4248661d753e75310898fbc6544b1))
* move Binary to BinaryService ([9db461b](https://github.com/loopingz/webda.io/commit/9db461b994db617b443aa2606b8b64d9c7a49a69))
* simplify configuration services by removing the webda node ([76487dc](https://github.com/loopingz/webda.io/commit/76487dc3fe1d8dc5f09d63f8607799799f3438b0))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* add missing file ([451a9d2](https://github.com/loopingz/webda.io/commit/451a9d208acd9ad1e28295de17f3a39a4ae8235d))
* add placeholder for bin ([22ec4e1](https://github.com/loopingz/webda.io/commit/22ec4e10980924d82935567df6e3440b16497ed9))
* deployer namespace ([d0fbbca](https://github.com/loopingz/webda.io/commit/d0fbbca80b69add5930b43c8c4a185b45012d347))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))
* readd missing cov ignore ([aed7524](https://github.com/loopingz/webda.io/commit/aed7524a58e2a2d226ac093e8609cc0b3c29874d))
* shell unit tests ([9df941a](https://github.com/loopingz/webda.io/commit/9df941abc1d32bf2be1b37f5f92123928311082d))
* sonar alerts ([b61cde7](https://github.com/loopingz/webda.io/commit/b61cde739271725822afc7e00d8898827b603f6f))
* tsc-esm library export to avoid double compilation ([eb0022c](https://github.com/loopingz/webda.io/commit/eb0022c091a60982009df25cd1905479320bb5ab))
</details>

<details><summary>websockets: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/websockets-v3.0.3...websockets-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

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
</details>

<details><summary>workout: 4.0.0</summary>

## [4.0.0](https://github.com/loopingz/webda.io/compare/workout-v3.0.1...workout-v4.0.0) (2023-06-30)


###   BREAKING CHANGES

* remove dynamic lastUpdate and creationDate
* remove node14 support

### Features

* add bunyan logger capability ([e752f81](https://github.com/loopingz/webda.io/commit/e752f81ab22189b562ff4cf4f5f3350edc89de77))
* add factory and permission query ([68ee7e9](https://github.com/loopingz/webda.io/commit/68ee7e92b0e0747b9ca1d796fcfb25919a5b58b2))
* add imports feature in Configuration ([eb4dbe6](https://github.com/loopingz/webda.io/commit/eb4dbe62d331fa29010bf10d82d87bebb404b3b9))
* add ProxyService ([c61a772](https://github.com/loopingz/webda.io/commit/c61a77284205c20bf12e305b6c7c88987ed62a43))
* add ref(..) to allow uid autocompletion ([de16cae](https://github.com/loopingz/webda.io/commit/de16cae506223322e4137b77b03afd4c84c22942))
* allow to set title on logProgressIncrement ([3c53395](https://github.com/loopingz/webda.io/commit/3c533953e214ec6382f93ca3ef84d70bf7a1c57e))
* allow to use CoreModel for exists ([25b8ffa](https://github.com/loopingz/webda.io/commit/25b8ffa3009c409f9476c20df3708a49d33ae787))
* move to es module ([2234943](https://github.com/loopingz/webda.io/commit/22349431f8241fda7a10ecdeb6563a676b935320))
* remove dynamic lastUpdate and creationDate ([ed9bcb3](https://github.com/loopingz/webda.io/commit/ed9bcb30691a5ff0c4c3769d572f39548c6d9b05))
* remove node14 support ([e2c7e90](https://github.com/loopingz/webda.io/commit/e2c7e9094da104ad443d06d65f16fa80a0ddda23))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* add missing file ([451a9d2](https://github.com/loopingz/webda.io/commit/451a9d208acd9ad1e28295de17f3a39a4ae8235d))
* core unit tests ([cddb5c4](https://github.com/loopingz/webda.io/commit/cddb5c480057020651f3e4e4337396c979b83ca7))
* elasticsearch 8.x ([79d4750](https://github.com/loopingz/webda.io/commit/79d4750f9490ac0ee0923e6fcc00493ed3815981))
* es test ([7959037](https://github.com/loopingz/webda.io/commit/79590378cb43fb15d8acd0e0eabf5cf972d41df5))
* FileBinary folder ([eff3469](https://github.com/loopingz/webda.io/commit/eff346975968e64304e90e9d59e286e2dba53642))
* if vanished file while FileUtils.find ([9d6be7d](https://github.com/loopingz/webda.io/commit/9d6be7dc536ce88bc1d2de1a8b020cbef72fc7b6))
* postgres unit tests ([0b2b5e8](https://github.com/loopingz/webda.io/commit/0b2b5e806c5e5f788514ca9a853c167e74128e7e))
* readd missing cov ignore ([aed7524](https://github.com/loopingz/webda.io/commit/aed7524a58e2a2d226ac093e8609cc0b3c29874d))
* shell unit tests ([9df941a](https://github.com/loopingz/webda.io/commit/9df941abc1d32bf2be1b37f5f92123928311082d))
* sonar ([4f08f95](https://github.com/loopingz/webda.io/commit/4f08f951407a9f39e3ce540ea3212970af38112f))
* update stream read on HttpContext ([f3e35bb](https://github.com/loopingz/webda.io/commit/f3e35bbcfb68aaa8d3f14c8f8f4d19153145191b))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/tsc-esm bumped from ^1.0.4 to ^2.0.0
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).