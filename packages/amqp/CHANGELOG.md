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
    * @webda/core bumped from ^3.2.2 to ^3.3.0
  * devDependencies
    * @webda/shell bumped from ^3.1.5 to ^3.2.0

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.3.0 to ^3.4.0
  * devDependencies
    * @webda/shell bumped from ^3.2.0 to ^3.2.1

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.5.0 to ^3.6.0
  * devDependencies
    * @webda/shell bumped from ^3.3.0 to ^3.4.0

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
    * @webda/core bumped from ^3.13.2 to ^3.14.0
  * devDependencies
    * @webda/shell bumped from ^3.9.3 to ^3.9.4

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.14.0 to ^3.15.0
  * devDependencies
    * @webda/shell bumped from ^3.9.4 to ^3.10.0

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

## [4.0.0-beta.7](https://github.com/loopingz/webda.io/compare/amqp-v4.0.0-beta.6...amqp-v4.0.0-beta.7) (2026-10-10)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.7
    * @webda/utils bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.7

## [4.0.0-beta.6](https://github.com/loopingz/webda.io/compare/amqp-v4.0.0-beta.5...amqp-v4.0.0-beta.6) (2026-10-09)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.6
    * @webda/utils bumped to 4.0.0-beta.6
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.6
    * @webda/test bumped to 4.0.0-beta.6

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/amqp-v4.0.0-beta.4...amqp-v4.0.0-beta.5) (2026-10-08)


### ⚠ BREAKING CHANGES

* **core:** models defining canAct are now enforced on REST, gRPC and MCP operations; refused calls return 403. Query pages can be shorter than their LIMIT. OwnerModel ignores a client supplied _user. ResourceAcl.canAct signature changed to (context, action) and entries need a principal.

### Bug Fixes

* **core:** enforce model permissions on every transport, deny by default ([#810](https://github.com/loopingz/webda.io/issues/810)) ([24c1182](https://github.com/loopingz/webda.io/commit/24c11824f38999ef28ec7795c8af8d0ba862d9be))
* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.5
    * @webda/utils bumped to 4.0.0-beta.5
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.5
    * @webda/test bumped to 4.0.0-beta.5

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/amqp-v4.0.0-beta.3...amqp-v4.0.0-beta.4) (2026-10-08)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.4
    * @webda/utils bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/amqp-v4.0.0-beta.1...amqp-v4.0.0-beta.3) (2026-10-05)


### ⚠ BREAKING CHANGES

* remove node 18 support

### Features

* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* **amqp:** re-enable module and migrate to current core API ([e52b4d4](https://github.com/loopingz/webda.io/commit/e52b4d45f63962afc714a3144edaee82ed360fae))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))


### Bug Fixes

* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.3
    * @webda/utils bumped to 4.0.0-beta.3
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.3
    * @webda/test bumped to 4.0.0-beta.3

## [4.0.0-beta.1](https://github.com/loopingz/webda.io/compare/amqp-v3.3.6...amqp-v4.0.0-beta.1) (2024-08-14)


### Miscellaneous Chores

* prepare version for 4.0 ([24e8e78](https://github.com/loopingz/webda.io/commit/24e8e789b8e4ac2364ac0d1669b115237ff4be6d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.16.0 to ^4.0.0-beta.1
  * devDependencies
    * @webda/shell bumped from ^3.11.0 to ^4.0.0-beta.1

## [3.3.0](https://github.com/loopingz/webda.io/compare/amqp-v3.2.0...amqp-v3.3.0) (2024-01-16)


### Features

* add service client event option ([cf68e7f](https://github.com/loopingz/webda.io/commit/cf68e7fa59ec26fc4e49ff593a6de4f53ea029c4))


### Bug Fixes

* allow to add parameters to assertQueue ([c4e312e](https://github.com/loopingz/webda.io/commit/c4e312e5d68d739d6fdff3d95b57d86c9eac291b))
* make amqp queueOptions optional ([1f40de1](https://github.com/loopingz/webda.io/commit/1f40de18b27d9fb7bed033e367e6ccb49c14f8b9))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.12.0 to ^3.13.0
  * devDependencies
    * @webda/shell bumped from ^3.9.0 to ^3.9.1

## [3.2.0](https://github.com/loopingz/webda.io/compare/amqp-v3.1.8...amqp-v3.2.0) (2024-01-09)


### Features

* add metrics to pubsub and update store for cache update ([5c6e196](https://github.com/loopingz/webda.io/commit/5c6e19619e00478baa332d8db1496ad0b8eb0cf9))
* add mutations on graphql ([fa3d647](https://github.com/loopingz/webda.io/commit/fa3d647eea8883ecf20bfd4d947f3f99ad05a0f3))
* add subscription system ([b4f625c](https://github.com/loopingz/webda.io/commit/b4f625c44a306f57c7cc44b3aae805b1e6537c52))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.11.2 to ^3.12.0
  * devDependencies
    * @webda/shell bumped from ^3.8.2 to ^3.9.0

## [3.1.0](https://github.com/loopingz/webda.io/compare/amqp-v3.0.12...amqp-v3.1.0) (2023-11-12)


### Features

* drop node16 as it is EOL ([a6b795a](https://github.com/loopingz/webda.io/commit/a6b795a76e5089a0cf81269c49e00131bc17c1a9))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.6.0 to ^3.7.0
  * devDependencies
    * @webda/shell bumped from ^3.4.0 to ^3.5.0

## [3.0.11](https://github.com/loopingz/webda.io/compare/amqp-v3.0.10...amqp-v3.0.11) (2023-10-04)


### Bug Fixes

* default toLowerCase for k8s resources name ([aaa0d58](https://github.com/loopingz/webda.io/commit/aaa0d5844f12532d2eb3a5813968a730deb4d4d0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.4.0 to ^3.5.0
  * devDependencies
    * @webda/shell bumped from ^3.2.1 to ^3.3.0

## [3.0.4](https://github.com/loopingz/webda.io/compare/amqp-v3.0.3...amqp-v3.0.4) (2023-06-30)


### Bug Fixes

* add explicit dependencies declaration ([#411](https://github.com/loopingz/webda.io/issues/411)) ([4d8cbae](https://github.com/loopingz/webda.io/commit/4d8cbae4d6d31b62df98832591bc97ca77ae6a69))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^3.1.1
  * devDependencies
    * @webda/shell bumped from ^3.0.2 to ^3.1.1
