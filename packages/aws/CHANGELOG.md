# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [4.0.0](https://github.com/loopingz/webda.io/compare/aws-v3.1.0...aws-v4.0.0) (2023-06-30)


### ⚠ BREAKING CHANGES

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
