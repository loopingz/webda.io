# Changelog

## [4.0.0-beta.6](https://github.com/loopingz/webda.io/compare/sdk-v4.0.0-beta.5...sdk-v4.0.0-beta.6) (2026-10-23)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
  * devDependencies
    * @webda/graphql bumped to 4.0.0-beta.13
    * @webda/grpc bumped to 4.0.0-beta.13
    * @webda/offline bumped to 4.0.0-beta.13
  * peerDependencies
    * @webda/graphql bumped to 4.0.0-beta.13
    * @webda/grpc bumped to 4.0.0-beta.13
    * @webda/offline bumped to 4.0.0-beta.13

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/sdk-v4.0.0-beta.4...sdk-v4.0.0-beta.5) (2026-10-22)


### ⚠ BREAKING CHANGES

* **core:** instance actions declaring non-context parameters now receive them instead of the operation context. Take the context with a context-typed parameter or useContext().

### Features

* **core:** model actions receive their typed parameters ([#946](https://github.com/loopingz/webda.io/issues/946), phase 1) ([#955](https://github.com/loopingz/webda.io/issues/955)) ([7e8eebd](https://github.com/loopingz/webda.io/commit/7e8eebd47af7748936272c43869152bf1716b485))
* opt-in total count for paginated queries (Repository.count, REST/GraphQL total) ([#967](https://github.com/loopingz/webda.io/issues/967)) ([b43e6d1](https://github.com/loopingz/webda.io/commit/b43e6d18820773d24a8b754013dc4dec4c57e1c7))
* **sdk:** opt-in query total with a cached total for the next pages ([#968](https://github.com/loopingz/webda.io/issues/968)) ([f764692](https://github.com/loopingz/webda.io/commit/f764692d08a6b99e0c7f34a5518f04fc4d681632))
* **sql-schema:** relational schema plan built from model metadata ([#937](https://github.com/loopingz/webda.io/issues/937)) ([6f50192](https://github.com/loopingz/webda.io/commit/6f5019210a7a3f84bddad061db931c31d98f4524))


### Bug Fixes

* **content-mapper:** record relation aliases, the ModelRelated attribute and [@enum](https://github.com/enum) values ([#940](https://github.com/loopingz/webda.io/issues/940)) ([6e7e701](https://github.com/loopingz/webda.io/commit/6e7e7018343671a1e4a11de0b447bb4a959a997b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.12
    * @webda/utils bumped to 4.0.0-beta.11
    * @webda/workout bumped to 4.0.0-beta.6
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.12
    * @webda/graphql bumped to 4.0.0-beta.12
    * @webda/grpc bumped to 4.0.0-beta.12
    * @webda/models bumped to 4.0.0-beta.12
    * @webda/offline bumped to 4.0.0-beta.12
    * @webda/ql bumped to 4.0.0-beta.9
    * @webda/test bumped to 4.0.0-beta.8
  * peerDependencies
    * @webda/graphql bumped to 4.0.0-beta.12
    * @webda/grpc bumped to 4.0.0-beta.12
    * @webda/offline bumped to 4.0.0-beta.12

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/sdk-v4.0.0-beta.3...sdk-v4.0.0-beta.4) (2026-10-16)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.11
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.11
    * @webda/graphql bumped to 4.0.0-beta.11
    * @webda/grpc bumped to 4.0.0-beta.11
    * @webda/models bumped to 4.0.0-beta.11
    * @webda/offline bumped to 4.0.0-beta.11
  * peerDependencies
    * @webda/graphql bumped to 4.0.0-beta.11
    * @webda/grpc bumped to 4.0.0-beta.11
    * @webda/offline bumped to 4.0.0-beta.11

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/sdk-v4.0.0-beta.2...sdk-v4.0.0-beta.3) (2026-10-15)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.10
    * @webda/utils bumped to 4.0.0-beta.10
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.10
    * @webda/graphql bumped to 4.0.0-beta.10
    * @webda/grpc bumped to 4.0.0-beta.10
    * @webda/models bumped to 4.0.0-beta.10
    * @webda/offline bumped to 4.0.0-beta.10
  * peerDependencies
    * @webda/graphql bumped to 4.0.0-beta.10
    * @webda/grpc bumped to 4.0.0-beta.10
    * @webda/offline bumped to 4.0.0-beta.10

## [4.0.0-beta.2](https://github.com/loopingz/webda.io/compare/sdk-v4.0.0-beta.1...sdk-v4.0.0-beta.2) (2026-10-14)


### Features

* **sdk:** typed frontend SDK over REST, GraphQL, gRPC and offline ([#850](https://github.com/loopingz/webda.io/issues/850)) ([#885](https://github.com/loopingz/webda.io/issues/885)) ([4d68a6a](https://github.com/loopingz/webda.io/commit/4d68a6ade4e5a12c3a836979dd04f5184b172b72))


### Bug Fixes

* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.9
    * @webda/utils bumped to 4.0.0-beta.9
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.9
    * @webda/graphql bumped to 4.0.0-beta.9
    * @webda/grpc bumped to 4.0.0-beta.9
    * @webda/models bumped to 4.0.0-beta.9
    * @webda/offline bumped to 4.0.0-beta.9
    * @webda/ql bumped to 4.0.0-beta.8
  * peerDependencies
    * @webda/graphql bumped to 4.0.0-beta.9
    * @webda/grpc bumped to 4.0.0-beta.9
    * @webda/offline bumped to 4.0.0-beta.9
