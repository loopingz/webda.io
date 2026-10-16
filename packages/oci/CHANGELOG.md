# Changelog

## [4.0.0-beta.12](https://github.com/loopingz/webda.io/compare/oci-v4.0.0-beta.11...oci-v4.0.0-beta.12) (2026-10-16)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.12

## [4.0.0-beta.11](https://github.com/loopingz/webda.io/compare/oci-v4.0.0-beta.10...oci-v4.0.0-beta.11) (2026-10-16)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.11
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.11

## [4.0.0-beta.10](https://github.com/loopingz/webda.io/compare/oci-v4.0.0-beta.9...oci-v4.0.0-beta.10) (2026-10-15)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.10
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.10

## [4.0.0-beta.9](https://github.com/loopingz/webda.io/compare/oci-v4.0.0-beta.8...oci-v4.0.0-beta.9) (2026-10-14)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.9
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.9

## [4.0.0-beta.8](https://github.com/loopingz/webda.io/compare/oci-v4.0.0-beta.7...oci-v4.0.0-beta.8) (2026-10-12)


### Bug Fixes

* enable strict mode in ql, oci, fs and auth ([#874](https://github.com/loopingz/webda.io/issues/874)) ([dec29f6](https://github.com/loopingz/webda.io/commit/dec29f657429eea40a21f0cae901af1e2c46074d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.8
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.8
    * @webda/test bumped to 4.0.0-beta.7

## [4.0.0-beta.7](https://github.com/loopingz/webda.io/compare/oci-v4.0.0-beta.6...oci-v4.0.0-beta.7) (2026-10-11)


### Features

* **core:** config encrypt encrypts every secret field, --check fails on unencrypted secrets ([#854](https://github.com/loopingz/webda.io/issues/854)) ([8926a02](https://github.com/loopingz/webda.io/commit/8926a024a527b4f5271cfa2b1e8a4e4535167620))
* **oci:** reproducible image builds ([#825](https://github.com/loopingz/webda.io/issues/825)) ([845cd5b](https://github.com/loopingz/webda.io/commit/845cd5ba24db80c7e3b2804dd28a1c3c717887a9))
* stable and documented configuration secret encryption ([#837](https://github.com/loopingz/webda.io/issues/837)) ([55fad94](https://github.com/loopingz/webda.io/commit/55fad94e96537c0b44ade1cdfb88e4b5e6c6035b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.7

## [4.0.0-beta.6](https://github.com/loopingz/webda.io/compare/oci-v4.0.0-beta.5...oci-v4.0.0-beta.6) (2026-10-09)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.6
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.6
    * @webda/test bumped to 4.0.0-beta.6

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/oci-v4.0.0-beta.4...oci-v4.0.0-beta.5) (2026-10-08)


### ⚠ BREAKING CHANGES

* **core:** models defining canAct are now enforced on REST, gRPC and MCP operations; refused calls return 403. Query pages can be shorter than their LIMIT. OwnerModel ignores a client supplied _user. ResourceAcl.canAct signature changed to (context, action) and entries need a principal.

### Bug Fixes

* **core:** enforce model permissions on every transport, deny by default ([#810](https://github.com/loopingz/webda.io/issues/810)) ([24c1182](https://github.com/loopingz/webda.io/commit/24c11824f38999ef28ec7795c8af8d0ba862d9be))
* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.5
    * @webda/workout bumped to 4.0.0-beta.5
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.5
    * @webda/test bumped to 4.0.0-beta.5

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/oci-v4.0.0-beta.1...oci-v4.0.0-beta.4) (2026-10-08)


### Features

* deployers as commands (deployment units, CloudFormation/Lambda, daemonless OCI images) ([#796](https://github.com/loopingz/webda.io/issues/796)) ([2539cc9](https://github.com/loopingz/webda.io/commit/2539cc991c29e65a76659a379d72ce7a51ebb1e7))


### Bug Fixes

* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
