# Changelog

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.1 to ^3.1.2
  * devDependencies
    * @webda/shell bumped from ^3.1.1 to ^3.1.2

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.2 to ^3.2.0
  * devDependencies
    * @webda/shell bumped from ^3.1.2 to ^3.1.3

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.2.0 to ^3.2.1
  * devDependencies
    * @webda/shell bumped from ^3.1.3 to ^3.1.4

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.2.1 to ^3.2.2
  * devDependencies
    * @webda/shell bumped from ^3.1.4 to ^3.1.5

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.7.0 to ^3.8.0
  * devDependencies
    * @webda/shell bumped from ^3.5.0 to ^3.6.0

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.8.0 to ^3.8.1
  * devDependencies
    * @webda/shell bumped from ^3.6.0 to ^3.6.1

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.8.1 to ^3.9.0
  * devDependencies
    * @webda/shell bumped from ^3.6.1 to ^3.6.2

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.9.0 to ^3.9.1
  * devDependencies
    * @webda/shell bumped from ^3.6.2 to ^3.6.3

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.11.0 to ^3.11.1
  * devDependencies
    * @webda/shell bumped from ^3.8.0 to ^3.8.1

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.11.1 to ^3.11.2
  * devDependencies
    * @webda/shell bumped from ^3.8.1 to ^3.8.2

## [3.8.0](https://github.com/loopingz/webda.io/compare/graphql-v3.7.0...graphql-v3.8.0) (2024-01-16)


### Features

* add service client event option ([cf68e7f](https://github.com/loopingz/webda.io/commit/cf68e7fa59ec26fc4e49ff593a6de4f53ea029c4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.12.0 to ^3.13.0
    * @webda/runtime bumped from ^3.2.0 to ^3.3.0
  * devDependencies
    * @webda/shell bumped from ^3.9.0 to ^3.9.1

## [3.7.0](https://github.com/loopingz/webda.io/compare/graphql-v3.6.2...graphql-v3.7.0) (2024-01-09)


### Features

* add Aggregation for subscriptions and event listener subscriptions ([8bca3ce](https://github.com/loopingz/webda.io/commit/8bca3cebd45e3d91355bf3d862abab93d3be14b4))
* add MergedEventIterator to compile multiple Iterator in one ([4b8e53e](https://github.com/loopingz/webda.io/commit/4b8e53e3295d85a45f3ab4cb654ccd6a0100d64b))
* add mutations on graphql ([fa3d647](https://github.com/loopingz/webda.io/commit/fa3d647eea8883ecf20bfd4d947f3f99ad05a0f3))
* add subscription system ([b4f625c](https://github.com/loopingz/webda.io/commit/b4f625c44a306f57c7cc44b3aae805b1e6537c52))
* implement filter on linked collection ([a08ef9b](https://github.com/loopingz/webda.io/commit/a08ef9bd8185803489b33fa170e50c919ffd082f))


### Bug Fixes

* date serializer ([2e66a6e](https://github.com/loopingz/webda.io/commit/2e66a6e0a514f7bd0972f01ede1752055c8eec73))
* dynamodb scan query splice bad result ([5c3d657](https://github.com/loopingz/webda.io/commit/5c3d6575191d481dedd2365407eb6fc47f223bd5))
* getMetrics ensure service name is included ([00881b7](https://github.com/loopingz/webda.io/commit/00881b7f08da6cabce4f617cf9a692db6a230af8))
* **graphql:** number 2^32 and maps type in models ([425b2c7](https://github.com/loopingz/webda.io/commit/425b2c7c89845c2dc36abb897ee482221a451749))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.11.2 to ^3.12.0
    * @webda/runtime bumped from ^3.1.5 to ^3.2.0
  * devDependencies
    * @webda/shell bumped from ^3.8.2 to ^3.9.0

## [3.6.0](https://github.com/loopingz/webda.io/compare/graphql-v3.5.0...graphql-v3.6.0) (2023-11-30)


### Features

* add ndjson streams and stream persistence for big MemoryStore ([d283948](https://github.com/loopingz/webda.io/commit/d2839481c4b8b28bf7c0f758a1ca2515517d960a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.10.0 to ^3.11.0
  * devDependencies
    * @webda/shell bumped from ^3.7.0 to ^3.8.0

## [3.5.0](https://github.com/loopingz/webda.io/compare/graphql-v3.4.4...graphql-v3.5.0) (2023-11-29)


### Features

* add a setModelStore to force model store ([5354f46](https://github.com/loopingz/webda.io/commit/5354f4686fd93f3e573d7b6209f3b38ffce06073))
* add action input validation and openapi definition ([fc0e28c](https://github.com/loopingz/webda.io/commit/fc0e28c30f3ca5866f4accad2ad8be0e2374d2b5))


### Bug Fixes

* graphql any[] type replaced by string[] ([c3ffe20](https://github.com/loopingz/webda.io/commit/c3ffe20a63c193b886345f7a4a73773f112fa747))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.9.1 to ^3.10.0
  * devDependencies
    * @webda/shell bumped from ^3.6.3 to ^3.7.0

## [3.4.0](https://github.com/loopingz/webda.io/compare/graphql-v3.3.2...graphql-v3.4.0) (2023-11-12)


### Features

* drop node16 as it is EOL ([a6b795a](https://github.com/loopingz/webda.io/commit/a6b795a76e5089a0cf81269c49e00131bc17c1a9))


### Bug Fixes

* **graphql:** prevent to fail if schema is unavailable ([6f84c00](https://github.com/loopingz/webda.io/commit/6f84c00308de8a3299688ad8243d1e7214f5b8b4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.6.0 to ^3.7.0
  * devDependencies
    * @webda/shell bumped from ^3.4.0 to ^3.5.0

## [3.3.2](https://github.com/loopingz/webda.io/compare/graphql-v3.3.1...graphql-v3.3.2) (2023-10-07)


### Bug Fixes

* display help command ([3d0b790](https://github.com/loopingz/webda.io/commit/3d0b79090f1fc23e3d02a7e7b0c3ce023f85f586))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.5.0 to ^3.6.0
  * devDependencies
    * @webda/shell bumped from ^3.3.0 to ^3.4.0

## [3.3.1](https://github.com/loopingz/webda.io/compare/graphql-v3.3.0...graphql-v3.3.1) (2023-10-04)


### Bug Fixes

* default toLowerCase for k8s resources name ([aaa0d58](https://github.com/loopingz/webda.io/commit/aaa0d5844f12532d2eb3a5813968a730deb4d4d0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.4.0 to ^3.5.0
  * devDependencies
    * @webda/shell bumped from ^3.2.1 to ^3.3.0

## [3.3.0](https://github.com/loopingz/webda.io/compare/graphql-v3.2.0...graphql-v3.3.0) (2023-09-07)


### Features

* add swagger-ui for dev ([a6adb77](https://github.com/loopingz/webda.io/commit/a6adb77fcfb38c6e6398d2404a9351d8871a0dc9))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.3.0 to ^3.4.0
  * devDependencies
    * @webda/shell bumped from ^3.2.0 to ^3.2.1

## [3.2.0](https://github.com/loopingz/webda.io/compare/graphql-v3.1.5...graphql-v3.2.0) (2023-08-30)


### Features

* add graphiql in devmode or flag enable ([c87098f](https://github.com/loopingz/webda.io/commit/c87098fde1c04f0b4353ee92565d535cfd59a0de))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.2.2 to ^3.3.0
  * devDependencies
    * @webda/shell bumped from ^3.1.5 to ^3.2.0

## [3.1.1](https://github.com/loopingz/webda.io/compare/graphql-v3.1.0...graphql-v3.1.1) (2023-06-30)


### Bug Fixes

* add explicit dependencies declaration ([#411](https://github.com/loopingz/webda.io/issues/411)) ([4d8cbae](https://github.com/loopingz/webda.io/commit/4d8cbae4d6d31b62df98832591bc97ca77ae6a69))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^3.1.1
  * devDependencies
    * @webda/shell bumped from ^3.1.0 to ^3.1.1

## [3.1.0](https://github.com/loopingz/webda.io/compare/graphql-v3.0.2...graphql-v3.1.0) (2023-06-30)


### Features

* add WS proxy system ([fdc394d](https://github.com/loopingz/webda.io/commit/fdc394de666d74e9130d29fb6d4ddd67b650430f))


### Bug Fixes

* @types/ws version ([f63b002](https://github.com/loopingz/webda.io/commit/f63b0025b72f96f4282fbd30232f02164134ed5e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.0.2 to ^3.1.0
  * devDependencies
    * @webda/shell bumped from ^3.0.2 to ^3.1.0
