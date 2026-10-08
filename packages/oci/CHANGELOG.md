# Changelog

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
