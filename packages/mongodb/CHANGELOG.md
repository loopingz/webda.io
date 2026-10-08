# Changelog

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.1.0 to ^3.1.1
  * devDependencies
    * @webda/shell bumped from ^3.1.0 to ^3.1.1

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
    * @webda/core bumped from ^3.4.0 to ^3.5.0
  * devDependencies
    * @webda/shell bumped from ^3.2.1 to ^3.3.0

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
    * @webda/core bumped from ^3.11.2 to ^3.12.0
  * devDependencies
    * @webda/shell bumped from ^3.8.2 to ^3.9.0

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.12.0 to ^3.13.0
  * devDependencies
    * @webda/shell bumped from ^3.9.0 to ^3.9.1

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

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/mongo-v4.0.0-beta.4...mongo-v4.0.0-beta.5) (2026-10-08)


### ⚠ BREAKING CHANGES

* **core:** models defining canAct are now enforced on REST, gRPC and MCP operations; refused calls return 403. Query pages can be shorter than their LIMIT. OwnerModel ignores a client supplied _user. ResourceAcl.canAct signature changed to (context, action) and entries need a principal.

### Bug Fixes

* **core:** enforce model permissions on every transport, deny by default ([#810](https://github.com/loopingz/webda.io/issues/810)) ([24c1182](https://github.com/loopingz/webda.io/commit/24c11824f38999ef28ec7795c8af8d0ba862d9be))
* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.5
    * @webda/ql bumped to 4.0.0-beta.5
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.5
    * @webda/test bumped to 4.0.0-beta.5

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/mongo-v4.0.0-beta.3...mongo-v4.0.0-beta.4) (2026-10-08)


### ⚠ BREAKING CHANGES

* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800))

### Features

* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800)) ([74dc5df](https://github.com/loopingz/webda.io/commit/74dc5df103bdf93cdab92b02ef966598e44e2735))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/mongo-v4.0.0-beta.1...mongo-v4.0.0-beta.3) (2026-10-05)


### ⚠ BREAKING CHANGES

* remove node 18 support
* remove expose for Store

### Features

* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* **mongodb:** re-enable module and migrate to current core API ([d2bf742](https://github.com/loopingz/webda.io/commit/d2bf742c0c7c6acfd1654f8db61960f9c343adfd))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* remove expose for Store ([c8a36b1](https://github.com/loopingz/webda.io/commit/c8a36b19c81b830e9c03195388b402e53f987e6e))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))
* **stores:** translate IS NULL and IS NOT NULL ([8dc727b](https://github.com/loopingz/webda.io/commit/8dc727b0aff4be2f7052f5c5799049de9819f2b6))


### Bug Fixes

* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* post-migration follow-ups (store create uuid, LambdaServer stage, drop workarounds) ([#784](https://github.com/loopingz/webda.io/issues/784)) ([7eead4d](https://github.com/loopingz/webda.io/commit/7eead4d71152c19abaa834817b8bf4a7f89818d1))
* **stores:** escape WebdaQL string values and handle TRUE/FALSE in query translators ([d02f0a2](https://github.com/loopingz/webda.io/commit/d02f0a2307ba8f32ec5d16bb1e214f32aa68dd06))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.3
    * @webda/ql bumped to 4.0.0-beta.3
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.3
    * @webda/test bumped to 4.0.0-beta.3

## [4.0.0-beta.1](https://github.com/loopingz/webda.io/compare/mongo-v3.2.16...mongo-v4.0.0-beta.1) (2024-08-14)


### Features

* separate WebdaQL module ([69beabb](https://github.com/loopingz/webda.io/commit/69beabb0d1715ab81636338509539ade89c07c6a))


### Miscellaneous Chores

* prepare version for 4.0 ([24e8e78](https://github.com/loopingz/webda.io/commit/24e8e789b8e4ac2364ac0d1669b115237ff4be6d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.16.0 to ^4.0.0-beta.1
  * devDependencies
    * @webda/shell bumped from ^3.11.0 to ^4.0.0-beta.1

## [3.2.0](https://github.com/loopingz/webda.io/compare/mongo-v3.1.9...mongo-v3.2.0) (2023-11-12)


### Features

* drop node16 as it is EOL ([a6b795a](https://github.com/loopingz/webda.io/commit/a6b795a76e5089a0cf81269c49e00131bc17c1a9))
* RESTDomainService: add the url info retriever on Binaries ([13fe77c](https://github.com/loopingz/webda.io/commit/13fe77ccd0082432ea79ec9b7c32ac261cebeb01))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped from ^3.6.0 to ^3.7.0
  * devDependencies
    * @webda/shell bumped from ^3.4.0 to ^3.5.0

## [3.1.0](https://github.com/loopingz/webda.io/compare/mongo-v3.0.2...mongo-v3.1.0) (2023-06-30)


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
