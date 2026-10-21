# Changelog

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.9.0 to ^3.9.1
  * devDependencies
    * @webda/shell bumped from ^3.6.2 to ^3.6.3

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.9.1 to ^3.10.0
  * devDependencies
    * @webda/shell bumped from ^3.6.3 to ^3.7.0

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.10.0 to ^3.11.0
  * devDependencies
    * @webda/shell bumped from ^3.7.0 to ^3.8.0

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

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.13.0 to ^3.13.1
  * devDependencies
    * @webda/shell bumped from ^3.9.1 to ^3.9.2

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.13.1 to ^3.13.2
  * devDependencies
    * @webda/shell bumped from ^3.9.2 to ^3.9.3

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.15.0 to ^3.15.1
  * devDependencies
    * @webda/shell bumped from ^3.10.0 to ^3.10.1

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.15.1 to ^3.16.0
  * devDependencies
    * @webda/shell bumped from ^3.10.1 to ^3.11.0

## [3.5.3](https://github.com/loopingz/webda.io/compare/runtime-v3.5.2...runtime-v3.5.3) (2026-10-21)


### Bug Fixes

* clean shutdown for cluster member ([6fab202](https://github.com/loopingz/webda.io/commit/6fab20272e88ac9ba10c091cec58f5689a21178e))
* prependQuery offset injection ([#682](https://github.com/loopingz/webda.io/issues/682)) ([67aead2](https://github.com/loopingz/webda.io/commit/67aead2ed728074242b3e761322f69bc14bd7738))
* stop is public ([457f603](https://github.com/loopingz/webda.io/commit/457f6039bd9f6a4bbe401714cbed9e00d3821eeb))
* typescript typing due to change in Buffer ([7bef830](https://github.com/loopingz/webda.io/commit/7bef830ad0034a36452b11345c23d8c7092c12d9))
* update webda.module.json for kubernetes ([adb6677](https://github.com/loopingz/webda.io/commit/adb6677a260ed553e9290fb67fa99fe17252554a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.18.1 to ^3.17.0
  * devDependencies
    * @webda/shell bumped from ^3.13.2 to ^3.11.1

## [3.5.0](https://github.com/loopingz/webda.io/compare/runtime-v3.4.0...runtime-v3.5.0) (2024-04-12)


### Features

* update to latest otel ([db00927](https://github.com/loopingz/webda.io/commit/db00927fa3bc442b21aac2a970b0da33b6c845b6))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.14.0 to ^3.15.0
    * @webda/workout bumped from ^3.1.3 to ^3.2.0
  * devDependencies
    * @webda/shell bumped from ^3.9.4 to ^3.10.0

## [3.4.0](https://github.com/loopingz/webda.io/compare/runtime-v3.3.2...runtime-v3.4.0) (2024-02-04)


### Features

* **postgres:** add option to create views for each models ([1830dc4](https://github.com/loopingz/webda.io/commit/1830dc43e76626ca8832b83548034acbff79e73b))


### Bug Fixes

* **ci:** pnpm explicit dependency to @webda/workout ([7e1f05e](https://github.com/loopingz/webda.io/commit/7e1f05ed030d6ad0c593da8683c1c347ad2fd08b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.13.2 to ^3.14.0
  * devDependencies
    * @webda/shell bumped from ^3.9.3 to ^3.9.4

## [3.3.0](https://github.com/loopingz/webda.io/compare/runtime-v3.2.0...runtime-v3.3.0) (2024-01-16)


### Features

* allow cluster member info to be extended ([cb1e982](https://github.com/loopingz/webda.io/commit/cb1e982814357145a47c5cfd039a7bacee379d86))
* **cluster:** add outofsync alert tweaking option ([b3e5d91](https://github.com/loopingz/webda.io/commit/b3e5d91ac1d8732f9f2819c1628a3bfb71de51e5))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.12.0 to ^3.13.0
  * devDependencies
    * @webda/shell bumped from ^3.9.0 to ^3.9.1

## [3.2.0](https://github.com/loopingz/webda.io/compare/runtime-v3.1.5...runtime-v3.2.0) (2024-01-09)


### Features

* add Aggregation for subscriptions and event listener subscriptions ([8bca3ce](https://github.com/loopingz/webda.io/commit/8bca3cebd45e3d91355bf3d862abab93d3be14b4))
* add encrypter and configuration encryption ([b53611c](https://github.com/loopingz/webda.io/commit/b53611cf9c18838b250e732a14a77224abca484d))
* add EventAsyncIterator ([f3eb7f9](https://github.com/loopingz/webda.io/commit/f3eb7f9953c908d8e3708b4d53978f2744817e94))
* add MergedEventIterator to compile multiple Iterator in one ([4b8e53e](https://github.com/loopingz/webda.io/commit/4b8e53e3295d85a45f3ab4cb654ccd6a0100d64b))
* add subscription system ([b4f625c](https://github.com/loopingz/webda.io/commit/b4f625c44a306f57c7cc44b3aae805b1e6537c52))
* move ProxyService to runtime ([#342](https://github.com/loopingz/webda.io/issues/342)) ([a95a797](https://github.com/loopingz/webda.io/commit/a95a7977ed4e35b0f475fd3cb0648ae5a0c5cc75))
* move some services from @webda/core to @webda/runtime ([#342](https://github.com/loopingz/webda.io/issues/342)) ([bf78ca9](https://github.com/loopingz/webda.io/commit/bf78ca90aadce5b92bc90986beeae3d6543631da))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.11.2 to ^3.12.0
  * devDependencies
    * @webda/shell bumped from ^3.8.2 to ^3.9.0

## [3.1.0](https://github.com/loopingz/webda.io/compare/runtime-v3.0.0...runtime-v3.1.0) (2023-11-18)


### Features

* add a BinaryModel for big json ([7849fac](https://github.com/loopingz/webda.io/commit/7849facb86118ee1d2eb19fc0479ba1ea769901f))
* add gzip compression for BinaryModel ([732b4a3](https://github.com/loopingz/webda.io/commit/732b4a3cf171fe5e8c1ce2842e3fd5214ad4ecef))
* add MigrationStore to @webda/runtime ([42613fd](https://github.com/loopingz/webda.io/commit/42613fd89377342ca803540dac7155ae5e88a810))


### Bug Fixes

* avoid exposing OpenAPI root if not defined ([e525412](https://github.com/loopingz/webda.io/commit/e52541277f7e6e2d3a9f0974ea0c2ab46492435c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.8.0 to ^3.9.0
  * devDependencies
    * @webda/shell bumped from ^3.3.0 to ^3.6.2
