# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [4.0.0-beta.2](https://github.com/loopingz/webda.io/compare/core-v4.0.0-beta.1...core-v4.0.0-beta.2) (2024-10-16)


### ⚠ BREAKING CHANGES

* remove node 18 support
* remove expose for Store

### Features

* add rest domain service ([bfc72e6](https://github.com/loopingz/webda.io/commit/bfc72e64728c3f1e1348322156f1b04835d6db37))
* remove expose for Store ([c8a36b1](https://github.com/loopingz/webda.io/commit/c8a36b19c81b830e9c03195388b402e53f987e6e))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))
* **rest:** add 201 - Created http code for creation ([#680](https://github.com/loopingz/webda.io/issues/680)) ([5db4dda](https://github.com/loopingz/webda.io/commit/5db4ddab838a25dc49bddd1705357187e2049a6c))
* test allow dynamic configuration in TestApplication ([3af8187](https://github.com/loopingz/webda.io/commit/3af8187ba6179e19c9db261f81075a86d09e0cc9))


### Bug Fixes

* MemoryQueue wait if no message available ([57d4bd8](https://github.com/loopingz/webda.io/commit/57d4bd834a8dcaa6f33f052c5e315079a58ffcce))
* optimize webda.module.json search ([e6db411](https://github.com/loopingz/webda.io/commit/e6db4111174d7e7428e1b1315f71d9027f4f6893))
* **ResourceService:** ensure we do not serve . files ([#678](https://github.com/loopingz/webda.io/issues/678)) ([8abbcda](https://github.com/loopingz/webda.io/commit/8abbcdae988f0ca3d6ecc1f70b4c6dee7f17002a))
* **rest:** restdomainservice parent query injector ([#683](https://github.com/loopingz/webda.io/issues/683)) ([7c8bf9b](https://github.com/loopingz/webda.io/commit/7c8bf9bb5b2dab0be890e9d5f1044f007eb6c76d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/ql bumped from ^4.0.0-beta.1 to ^4.0.0-beta.2
    * @webda/workout bumped from ^4.0.0-beta.1 to ^4.0.0-beta.2
  * devDependencies
    * @webda/tsc-esm bumped from ^4.0.0-beta.1 to ^4.0.0-beta.2

## [4.0.0-beta.1](https://github.com/loopingz/webda.io/compare/core-v3.16.0...core-v4.0.0-beta.1) (2024-08-14)


### ⚠ BREAKING CHANGES

* update StorageFinder to use promises to allow GCS/S3

### Features

* add iterate method definition ([88e0b98](https://github.com/loopingz/webda.io/commit/88e0b982c77eca2ab567da2bc1779da94755f87c))
* separate WebdaQL module ([69beabb](https://github.com/loopingz/webda.io/commit/69beabb0d1715ab81636338509539ade89c07c6a))
* update StorageFinder to use promises to allow GCS/S3 ([6f36aec](https://github.com/loopingz/webda.io/commit/6f36aecffbdd080a92840be5e3a949c91e3281c8))


### Bug Fixes

* add cache-control headers by default ([70c040e](https://github.com/loopingz/webda.io/commit/70c040ed663f3ddd4a7f360d0b26991d4415f2f1))
* prometheus missing export and additional close ([1e17465](https://github.com/loopingz/webda.io/commit/1e17465928bc9edffc7ad824de5a63d779f6a2a0))
* pubsub queue abusive close ([33ccadc](https://github.com/loopingz/webda.io/commit/33ccadcd630e6de84b00745cb48012231f3d69bd))


### Miscellaneous Chores

* prepare version for 4.0 ([24e8e78](https://github.com/loopingz/webda.io/commit/24e8e789b8e4ac2364ac0d1669b115237ff4be6d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped from ^3.2.0 to ^4.0.0-beta.1
    * @webda/ql bumped from ^3.999.0 to ^4.0.0-beta.1
  * devDependencies
    * @webda/tsc-esm bumped from ^1.3.0 to ^4.0.0-beta.1

## [3.16.0](https://github.com/loopingz/webda.io/compare/core-v3.15.1...core-v3.16.0) (2024-07-16)


### Features

* **cloudevents:** add module ([562f4a9](https://github.com/loopingz/webda.io/commit/562f4a929e6cb3931a07d9db23d3e1b596272d16))


### Bug Fixes

* **core:** filequeue node 22 lock ([266eb8a](https://github.com/loopingz/webda.io/commit/266eb8a197f660f16026f69591e19e2a5b2a0856))

## [3.15.1](https://github.com/loopingz/webda.io/compare/core-v3.15.0...core-v3.15.1) (2024-05-19)


### Bug Fixes

* update in otel and json-schema-generator ([c1d9866](https://github.com/loopingz/webda.io/commit/c1d9866ffc6717b622c4e4d72682ef91dc187a12))

## [3.15.0](https://github.com/loopingz/webda.io/compare/core-v3.14.0...core-v3.15.0) (2024-04-12)


### Features

* update store to model ([#577](https://github.com/loopingz/webda.io/issues/577)) ([018d096](https://github.com/loopingz/webda.io/commit/018d0969ce83b9a1e8346a9ef5df9857573adb3e))
* update to latest otel ([db00927](https://github.com/loopingz/webda.io/commit/db00927fa3bc442b21aac2a970b0da33b6c845b6))


### Bug Fixes

* WebdaQL prepend with limit and offset ([55cb37a](https://github.com/loopingz/webda.io/commit/55cb37a233fa582c24a53171ce9a035480defe8e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped from ^3.1.3 to ^3.2.0

## [3.14.0](https://github.com/loopingz/webda.io/compare/core-v3.13.2...core-v3.14.0) (2024-02-04)


### Features

* **postgres:** add option to create views for each models ([1830dc4](https://github.com/loopingz/webda.io/commit/1830dc43e76626ca8832b83548034acbff79e73b))


### Bug Fixes

* **core:** plurals with s ending name ([b643003](https://github.com/loopingz/webda.io/commit/b64300360bbe07adf65203997ce86d6bc38279cf))

## [3.13.2](https://github.com/loopingz/webda.io/compare/core-v3.13.1...core-v3.13.2) (2024-01-22)

### Bug Fixes

- numeric equals on postgres ([75f5e36](https://github.com/loopingz/webda.io/commit/75f5e36e1517a29f99c99e7e4af0e4d5da9ba8bd))

## [3.13.1](https://github.com/loopingz/webda.io/compare/core-v3.13.0...core-v3.13.1) (2024-01-16)

### Bug Fixes

- registerInteruptableProcess before Core.get() exists ([0b9cbcb](https://github.com/loopingz/webda.io/commit/0b9cbcb87ab03316ad78c3ef3be89baaae4d92f7))

## [3.13.0](https://github.com/loopingz/webda.io/compare/core-v3.12.0...core-v3.13.0) (2024-01-16)

### Features

- add service client event option ([cf68e7f](https://github.com/loopingz/webda.io/commit/cf68e7fa59ec26fc4e49ff593a6de4f53ea029c4))

### Bug Fixes

- clean cancel on SIGINT ([90c8627](https://github.com/loopingz/webda.io/commit/90c862701bc2e17ff2f513c0a0e98af5aa8fc883))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @webda/workout bumped from ^3.1.2 to ^3.1.3
  - devDependencies
    - @webda/tsc-esm bumped from ^1.2.0 to ^1.3.0

## [3.12.0](https://github.com/loopingz/webda.io/compare/core-v3.11.2...core-v3.12.0) (2024-01-09)

### Features

- add a PartialValidator for query ([1ef8dea](https://github.com/loopingz/webda.io/commit/1ef8dea2b6e96ee007ed278267e21d3e9e0ff41a))
- add Aggregation for subscriptions and event listener subscriptions ([8bca3ce](https://github.com/loopingz/webda.io/commit/8bca3cebd45e3d91355bf3d862abab93d3be14b4))
- add encrypter and configuration encryption ([b53611c](https://github.com/loopingz/webda.io/commit/b53611cf9c18838b250e732a14a77224abca484d))
- add metrics to pubsub and update store for cache update ([5c6e196](https://github.com/loopingz/webda.io/commit/5c6e19619e00478baa332d8db1496ad0b8eb0cf9))
- add mutations on graphql ([fa3d647](https://github.com/loopingz/webda.io/commit/fa3d647eea8883ecf20bfd4d947f3f99ad05a0f3))
- add subscription system ([b4f625c](https://github.com/loopingz/webda.io/commit/b4f625c44a306f57c7cc44b3aae805b1e6537c52))
- make CoreModel class fully compatible with EventEmitter ([76c3b9b](https://github.com/loopingz/webda.io/commit/76c3b9b16a855a15008e9afe1ff0b8c7ea47ebb3))
- move ProxyService to runtime ([#342](https://github.com/loopingz/webda.io/issues/342)) ([a95a797](https://github.com/loopingz/webda.io/commit/a95a7977ed4e35b0f475fd3cb0648ae5a0c5cc75))
- move some services from @webda/core to @webda/runtime ([#342](https://github.com/loopingz/webda.io/issues/342)) ([bf78ca9](https://github.com/loopingz/webda.io/commit/bf78ca90aadce5b92bc90986beeae3d6543631da))
- use MemoryStore cache by default on all store ([85c9288](https://github.com/loopingz/webda.io/commit/85c92884736e5955ed749ca61361eb8e3f1b6bfc))

### Bug Fixes

- &gt; &lt; characters in query were sanitized ([ea19364](https://github.com/loopingz/webda.io/commit/ea193646b7603ec786413ccd74316127f2badc84))
- append condition to query ([4c0e3fc](https://github.com/loopingz/webda.io/commit/4c0e3fc08a779c1b4c72ffa8472595cc35f85b6b))
- ASC/DESC in ORDER BY query with prepended condition ([1903a12](https://github.com/loopingz/webda.io/commit/1903a126688615efb7f7ea3c66342827116e2267))
- cache sync ([0475815](https://github.com/loopingz/webda.io/commit/047581528891dbb35f9904bad367e5e4d6e3a116))
- dynamodb scan query splice bad result ([5c3d657](https://github.com/loopingz/webda.io/commit/5c3d6575191d481dedd2365407eb6fc47f223bd5))
- getMetrics ensure service name is included ([00881b7](https://github.com/loopingz/webda.io/commit/00881b7f08da6cabce4f617cf9a692db6a230af8))
- NotEnumerable properties should not be in schema ([cb9e4ac](https://github.com/loopingz/webda.io/commit/cb9e4ace3053750e9ab3bfe5443d2cde577d6676))
- **test:** store metric now have the service name ([12baed4](https://github.com/loopingz/webda.io/commit/12baed4a8525278f401299989111fec552f2363a))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @webda/workout bumped from ^3.1.1 to ^3.1.2
  - devDependencies
    - @webda/tsc-esm bumped from ^1.1.1 to ^1.2.0

## [3.11.2](https://github.com/loopingz/webda.io/compare/core-v3.11.1...core-v3.11.2) (2023-12-05)

### Bug Fixes

- Action override in subclass ([113f5a6](https://github.com/loopingz/webda.io/commit/113f5a60907f3e6dcea31bf82e0f476fe3b2d085))
- named action execution ([931f4b2](https://github.com/loopingz/webda.io/commit/931f4b2e3362d947fa0ec379a4331b13be2a6db2))

## [3.11.1](https://github.com/loopingz/webda.io/compare/core-v3.11.0...core-v3.11.1) (2023-12-04)

### Bug Fixes

- allow Binaries to define metadata and metadata schema ([2001b1e](https://github.com/loopingz/webda.io/commit/2001b1e9a43b415a25e9e7726e94d351d1749e51))
- FileUtils.walk wrong depth limit ([9e6ce51](https://github.com/loopingz/webda.io/commit/9e6ce5181b0cd2533077253966ed80d6363d91ba))

## [3.11.0](https://github.com/loopingz/webda.io/compare/core-v3.10.0...core-v3.11.0) (2023-11-30)

### Features

- add ndjson streams and stream persistence for big MemoryStore ([d283948](https://github.com/loopingz/webda.io/commit/d2839481c4b8b28bf7c0f758a1ca2515517d960a))

### Bug Fixes

- **tsc-esm:** node module import rewrite .js ([e4a15ae](https://github.com/loopingz/webda.io/commit/e4a15ae90a761620520cb890fa5a9121415c453b))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @webda/workout bumped from ^3.1.0 to ^3.1.1
  - devDependencies
    - @webda/tsc-esm bumped from ^1.1.0 to ^1.1.1

## [3.10.0](https://github.com/loopingz/webda.io/compare/core-v3.9.1...core-v3.10.0) (2023-11-29)

### Features

- add a setModelStore to force model store ([5354f46](https://github.com/loopingz/webda.io/commit/5354f4686fd93f3e573d7b6209f3b38ffce06073))
- add action input validation and openapi definition ([fc0e28c](https://github.com/loopingz/webda.io/commit/fc0e28c30f3ca5866f4accad2ad8be0e2374d2b5))
- add util registerModel in test ([059eee8](https://github.com/loopingz/webda.io/commit/059eee88f69821c9278a85ea9623883f57bfabf0))
- allow to get routes from router ([dcdbd74](https://github.com/loopingz/webda.io/commit/dcdbd74d67abd1f52189ae647c1cdc63c0753661))
- allow to specify action name in @Action ([ed1429f](https://github.com/loopingz/webda.io/commit/ed1429fe39a9e2c8340984a0b231c44464b4204a))
- async module use AsyncAction model directly ([862d051](https://github.com/loopingz/webda.io/commit/862d0510f0104386459e51f80ef2650f64bdaa67))
- compress MemoryStore persistence and handle .gz in FileUtils.save/load ([997e11b](https://github.com/loopingz/webda.io/commit/997e11b04661f3dd14ab68c568ff6d103df7572f))
- manage all models by default for a BinaryService ([c3524da](https://github.com/loopingz/webda.io/commit/c3524daf10e237070d613d8e6dd1a2b222752def))
- speed up test by cache unpackedapplication.load ([242ee04](https://github.com/loopingz/webda.io/commit/242ee0460088b2d4b7ddd87e1906aa2f682e9ab4))

### Bug Fixes

- graphql any[] type replaced by string[] ([c3ffe20](https://github.com/loopingz/webda.io/commit/c3ffe20a63c193b886345f7a4a73773f112fa747))

## [3.9.1](https://github.com/loopingz/webda.io/compare/core-v3.9.0...core-v3.9.1) (2023-11-22)

### Bug Fixes

- add more explicit message for ValidationError ([9cf3d64](https://github.com/loopingz/webda.io/commit/9cf3d64d9fc9ed14dcbc194a3e0a28d9230d1311))
- organize imports ([0326b4b](https://github.com/loopingz/webda.io/commit/0326b4b973a307b91cb619a3ec79382bf7f8d101))

## [3.9.0](https://github.com/loopingz/webda.io/compare/core-v3.8.1...core-v3.9.0) (2023-11-18)

### Features

- add a BinaryModel for big json ([7849fac](https://github.com/loopingz/webda.io/commit/7849facb86118ee1d2eb19fc0479ba1ea769901f))
- allow return of async function for StoreMigration ([baebc5f](https://github.com/loopingz/webda.io/commit/baebc5fe781a5030b73059a53a4e39ad2b4dcc6e))

### Bug Fixes

- avoid exposing OpenAPI root if not defined ([e525412](https://github.com/loopingz/webda.io/commit/e52541277f7e6e2d3a9f0974ea0c2ab46492435c))
- links with ** prefix misplaced with \_** by escapeName ([6a5a8b9](https://github.com/loopingz/webda.io/commit/6a5a8b91ae9e02d65b0a8db6c3647d5108de104f))

## [3.8.1](https://github.com/loopingz/webda.io/compare/core-v3.8.0...core-v3.8.1) (2023-11-15)

### Bug Fixes

- getGraph case insensitive ([a35ea49](https://github.com/loopingz/webda.io/commit/a35ea49ad5f0e676f0c483ae2a23ab90fe0c4315))

## [3.8.0](https://github.com/loopingz/webda.io/compare/core-v3.7.0...core-v3.8.0) (2023-11-14)

### Features

- add otel module ([1841c28](https://github.com/loopingz/webda.io/commit/1841c28ab6225f6e2df3068f6869f1487b470d52))

## [3.7.0](https://github.com/loopingz/webda.io/compare/core-v3.6.0...core-v3.7.0) (2023-11-12)

### Features

- add an isEmpty method for Binary ([daf5832](https://github.com/loopingz/webda.io/commit/daf5832f4ca8b867eff1669e455f9761f1a15834))
- add CoreModel listeners system ([977dd9d](https://github.com/loopingz/webda.io/commit/977dd9d8a04f5b3e6d19f09f8755277b26242a18))
- add execute/wait method to Throttler ([b6cd66b](https://github.com/loopingz/webda.io/commit/b6cd66b49cc051f1eec085542fa4cf76f822f19f))
- add iterate generator methods ([ff45183](https://github.com/loopingz/webda.io/commit/ff45183625bdce480f396f88f594fe196415d3da))
- drop node16 as it is EOL ([a6b795a](https://github.com/loopingz/webda.io/commit/a6b795a76e5089a0cf81269c49e00131bc17c1a9))
- modelmapper service ([e5eee5f](https://github.com/loopingz/webda.io/commit/e5eee5f9c79f513a6bd9efe2e464c4491ac6924b))
- RESTDomainService: add the url info retriever on Binaries ([13fe77c](https://github.com/loopingz/webda.io/commit/13fe77ccd0082432ea79ec9b7c32ac261cebeb01))
- Store: add additionalModels to compose models in store ([e0f1d69](https://github.com/loopingz/webda.io/commit/e0f1d69c7a1302c9df1ea2fa365e422b141c0d89))
- Throttler add a static method ([dd5178e](https://github.com/loopingz/webda.io/commit/dd5178e385bd970ab0e36a6f4ecb6dd63b438bc2))

### Bug Fixes

- BinaryFile: fallback on originalname if name is not present ([245a24b](https://github.com/loopingz/webda.io/commit/245a24b97963d51c2b5085fa29c5b54e40bf46d4))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @webda/workout bumped from ^3.0.4 to ^3.1.0
  - devDependencies
    - @webda/tsc-esm bumped from ^1.0.6 to ^1.1.0

## [3.6.0](https://github.com/loopingz/webda.io/compare/core-v3.5.0...core-v3.6.0) (2023-10-07)

### Features

- add isGlobal to Context ([6423ba7](https://github.com/loopingz/webda.io/commit/6423ba7a23e96c6132ca468074e5e6fdd66d71ce))
- add stop function for service ([c4fb0ec](https://github.com/loopingz/webda.io/commit/c4fb0ec6cc1b1ee49105193cedad32538742113a))
- allow context propagation in linked model ([e84df9a](https://github.com/loopingz/webda.io/commit/e84df9a7435db40d56d498b624d5f71e9f2d0ebe))

### Bug Fixes

- display help command ([3d0b790](https://github.com/loopingz/webda.io/commit/3d0b79090f1fc23e3d02a7e7b0c3ce023f85f586))
- domainservice model actions ([48a899a](https://github.com/loopingz/webda.io/commit/48a899adac3c81a611702defccee4871a7941df7))
- remove completely the \_ prefix of action method ([3530b60](https://github.com/loopingz/webda.io/commit/3530b60fe51ee3f913b71801009dbace2b68188d))
- setContext on undefined reference ([030db1b](https://github.com/loopingz/webda.io/commit/030db1bc6166a8d18248d304b6bf3bf988e8a9f7))
- write on flushed header ([2d1ef2e](https://github.com/loopingz/webda.io/commit/2d1ef2e59d3809e5c1dbe82b5312e31fb2015eca))

## [3.5.0](https://github.com/loopingz/webda.io/compare/core-v3.4.0...core-v3.5.0) (2023-10-04)

### Features

- add absolute url when prefix is in use for Router ([8ea07f7](https://github.com/loopingz/webda.io/commit/8ea07f7f66a09ebf95a79a9edea2cef2dc399128))
- add more cases to transformName for RESTDomainService ([b1071f2](https://github.com/loopingz/webda.io/commit/b1071f20157932ccbd4e0150791300f624a6e25c))
- ensure YAMLUtils.parse can handle multiple documents ([11061f9](https://github.com/loopingz/webda.io/commit/11061f92c0e91e8c80f92027392942eb0ed2b810))

### Bug Fixes

- . route on / url service ([426ec2a](https://github.com/loopingz/webda.io/commit/426ec2a386ca409c581827a294e11af09536cf65))
- default toLowerCase for k8s resources name ([aaa0d58](https://github.com/loopingz/webda.io/commit/aaa0d5844f12532d2eb3a5813968a730deb4d4d0))
- display of double import warning ([c55f2d8](https://github.com/loopingz/webda.io/commit/c55f2d83f75143a24a6af2035d82b6c593e0014f))
- ensure a / exists before root collection for RESTDomainService ([555782e](https://github.com/loopingz/webda.io/commit/555782e4c8bd5f2a43cff4e7ee447a64e2982cd1))
- machineIdSync catch error ([7a29f5c](https://github.com/loopingz/webda.io/commit/7a29f5c548e4db50f3bebc5b8e248ddfaf485dad))
- set devMode prior to initialization ([cb62746](https://github.com/loopingz/webda.io/commit/cb627464a23c9f0741a2353654f30b700676823c))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @webda/workout bumped from ^3.0.3 to ^3.0.4

## [3.4.0](https://github.com/loopingz/webda.io/compare/core-v3.3.0...core-v3.4.0) (2023-09-07)

### Features

- add swagger-ui for dev ([a6adb77](https://github.com/loopingz/webda.io/commit/a6adb77fcfb38c6e6398d2404a9351d8871a0dc9))

### Bug Fixes

- DomainService collection query ([6f81d7c](https://github.com/loopingz/webda.io/commit/6f81d7c10ab2d554c3c309fdca4063b3db83c2f1))
- query parameters on collection for DomainService ([ef6d18d](https://github.com/loopingz/webda.io/commit/ef6d18d8283d789fceb278d1a969eb49db061d0b))
- query SubExpression only ([36bccd7](https://github.com/loopingz/webda.io/commit/36bccd7992f4260a6f27ad15388f5f0c320d4dec))

## [3.3.0](https://github.com/loopingz/webda.io/compare/core-v3.2.2...core-v3.3.0) (2023-08-30)

### Features

- allow no domain on cookie to default on domain only ([308fa49](https://github.com/loopingz/webda.io/commit/308fa493e3f2e813d919f1375839302512eb7969))

### Bug Fixes

- beans local configuration without config declaration ([5186555](https://github.com/loopingz/webda.io/commit/5186555a5d5318e750ea585ca90ea693a41db47e))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @webda/workout bumped from ^3.0.2 to ^3.0.3
  - devDependencies
    - @webda/tsc-esm bumped from ^1.0.5 to ^1.0.6

## [3.2.2](https://github.com/loopingz/webda.io/compare/core-v3.2.1...core-v3.2.2) (2023-07-19)

### Bug Fixes

- allow no resolution for symlink to fix aspect_build_js all symlink ([a6a97ad](https://github.com/loopingz/webda.io/commit/a6a97ad4ada88b83b8c32ab2ef40e6482944b333))
- make values optional to allow downward compatibility ([c0fec4f](https://github.com/loopingz/webda.io/commit/c0fec4fb21dba5e6c97f3ff87e15bf0abf2334bc))

## [3.2.1](https://github.com/loopingz/webda.io/compare/core-v3.2.0...core-v3.2.1) (2023-07-08)

### Bug Fixes

- keep symlink path with folder symlinked ([bd3d7b5](https://github.com/loopingz/webda.io/commit/bd3d7b59d4a22d3e5e26b24532214ee62505098a))
- relax version condition between @webda/shell and @webda/core ([b634574](https://github.com/loopingz/webda.io/commit/b6345743ea5ea0ef66615d7e1ae3bca4c8610122))

## [3.2.0](https://github.com/loopingz/webda.io/compare/core-v3.1.2...core-v3.2.0) (2023-07-07)

### Features

- add a Webda.UpdateContextRoute to be able to alter router decision ([22463f9](https://github.com/loopingz/webda.io/commit/22463f9b12a25cbee124184df0243d8ab7bf706d))
- add regexp validator utility classes ([b71f1ca](https://github.com/loopingz/webda.io/commit/b71f1ca37ac3602675de21341ac843833d6eaf63))

### Bug Fixes

- ignore any .folder in node_modules for pnpm and nx ([ebe7f81](https://github.com/loopingz/webda.io/commit/ebe7f81e19d27f5a8bed27e040a18c2925fe5e27))

## [3.1.2](https://github.com/loopingz/webda.io/compare/core-v3.1.1...core-v3.1.2) (2023-07-01)

### Bug Fixes

- allow to specify a machine id ([#413](https://github.com/loopingz/webda.io/issues/413)) ([fa24d8e](https://github.com/loopingz/webda.io/commit/fa24d8ec00340903e180ba16dc7dbf5765430d21))

## [3.1.1](https://github.com/loopingz/webda.io/compare/core-v3.1.0...core-v3.1.1) (2023-06-30)

### Bug Fixes

- add explicit dependencies declaration ([#411](https://github.com/loopingz/webda.io/issues/411)) ([4d8cbae](https://github.com/loopingz/webda.io/commit/4d8cbae4d6d31b62df98832591bc97ca77ae6a69))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @webda/workout bumped from ^3.0.1 to ^3.0.2
  - devDependencies
    - @webda/tsc-esm bumped from ^1.0.4 to ^1.0.5

## [3.1.0](https://github.com/loopingz/webda.io/compare/core-v3.0.2...core-v3.1.0) (2023-06-30)

### Features

- add WS proxy system ([fdc394d](https://github.com/loopingz/webda.io/commit/fdc394de666d74e9130d29fb6d4ddd67b650430f))
- allow usage of lowercase log level ([6e8efdb](https://github.com/loopingz/webda.io/commit/6e8efdbbdfee1cbe1bcb04e9daf17a4aab89ae1f))

### Bug Fixes

- @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))
- force file format with JSON/YAMLUtils.saveFile ([d629ad6](https://github.com/loopingz/webda.io/commit/d629ad6ac62ae059cdec9700a48813d489316325))
- improve error message for unsupported diagrams ([03238b0](https://github.com/loopingz/webda.io/commit/03238b072ad3525ed463212fc77463f958259f90))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @webda/workout bumped from ^3.0.0 to ^3.0.1
  - devDependencies
    - @webda/tsc-esm bumped from ^1.0.3 to ^1.0.4

## [1.0.1](https://github.com/loopingz/webda.io/compare/@webda/core@1.0.0...@webda/core@1.0.1) (2021-03-18)

**Note:** Version bump only for package @webda/core

# 1.0.0-beta.0 (2019-08-21)

### Bug Fixes

- code smell ([af4f211](https://github.com/loopingz/webda/commit/af4f211))
- move away from checkCSRF to checkRequest ([84a9265](https://github.com/loopingz/webda/commit/84a9265))
- resolved routes issue within test ([62b41f2](https://github.com/loopingz/webda/commit/62b41f2))
- update all packages to use the new scope [@webda](https://github.com/webda) ([6acc1d5](https://github.com/loopingz/webda/commit/6acc1d5))
- update imports ([7896f0c](https://github.com/loopingz/webda/commit/7896f0c))

### Features

- new versioning system ([27ab549](https://github.com/loopingz/webda/commit/27ab549))

### BREAKING CHANGES

- need to update as CorsFilter is not exported anymore
- new v1.0.0
