# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [4.0.0](https://github.com/loopingz/webda.io/compare/shell-v3.1.0...shell-v4.0.0) (2023-06-30)


### ⚠ BREAKING CHANGES

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

## [3.1.0](https://github.com/loopingz/webda.io/compare/shell-v3.0.2...shell-v3.1.0) (2023-06-30)


### Features

* add smart compilation for webda binary ([48e17ed](https://github.com/loopingz/webda.io/commit/48e17eda613b171ccb240950e167fe3c806ee78f)), closes [#402](https://github.com/loopingz/webda.io/issues/402)
* add WS proxy system ([fdc394d](https://github.com/loopingz/webda.io/commit/fdc394de666d74e9130d29fb6d4ddd67b650430f))
* allow redirect with WebdaError.Redirect ([499432e](https://github.com/loopingz/webda.io/commit/499432edd2bc9b542d7551b398a8b32648f04c4e))
* allow usage of lowercase log level ([6e8efdb](https://github.com/loopingz/webda.io/commit/6e8efdbbdfee1cbe1bcb04e9daf17a4aab89ae1f))
* emit a Webda.Init.Http when http server is ready ([5513a21](https://github.com/loopingz/webda.io/commit/5513a214ed46ab7cf43ce0ae8e364e72a1333725))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
* add missing dependencies ([189863f](https://github.com/loopingz/webda.io/commit/189863fcd18f27295eb4630febe7cf852dcc12e8))
* add missing dependencies for pnpm/bazel ([1ec04a3](https://github.com/loopingz/webda.io/commit/1ec04a375998ee7a7a00ea03c30a2960b7778d6b))
* improve error message for unsupported diagrams ([03238b0](https://github.com/loopingz/webda.io/commit/03238b072ad3525ed463212fc77463f958259f90))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.0.2 to ^3.1.0
    * @webda/kubernetes bumped from ^3.0.2 to ^3.0.3
    * @webda/tsc-esm bumped from ^1.0.3 to ^1.0.4
    * @webda/workout bumped from ^3.0.0 to ^3.0.1

## [1.0.2](https://github.com/loopingz/webda.io/compare/@webda/shell@1.0.1...@webda/shell@1.0.2) (2021-03-24)


### Bug Fixes

* scan dependency specific versions ([#27](https://github.com/loopingz/webda.io/issues/27)) ([c75a18f](https://github.com/loopingz/webda.io/commit/c75a18f31523198679bc7cf00581f13c265d141b))





## [1.0.1](https://github.com/loopingz/webda.io/compare/@webda/shell@1.0.0...@webda/shell@1.0.1) (2021-03-18)


### Bug Fixes

* add .zip if missing for packager ([072ca64](https://github.com/loopingz/webda.io/commit/072ca6433640673708fbcaf67e9bf8bbecd06c71))
* avoid failing if includeWorkspaces is used without workspace ([187665e](https://github.com/loopingz/webda.io/commit/187665e7628d1e22cc04ba2108cdc0d69a87fbe9))





# 1.0.0-beta.0 (2019-08-21)


### Bug Fixes

* **shell:** use local webda when available ([a02f3ff](https://github.com/loopingz/webda.io/commit/a02f3ff))
* @webda/shell import for @webda/core ([d3eca0f](https://github.com/loopingz/webda.io/commit/d3eca0f))
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
