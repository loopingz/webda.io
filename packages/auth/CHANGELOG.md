# Changelog

## [4.0.0-beta.11](https://github.com/loopingz/webda.io/compare/auth-v4.0.0-beta.10...auth-v4.0.0-beta.11) (2026-10-16)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.11
    * @webda/models bumped to 4.0.0-beta.11
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.11
    * @webda/fs bumped to 4.0.0-beta.11

## [4.0.0-beta.10](https://github.com/loopingz/webda.io/compare/auth-v4.0.0-beta.9...auth-v4.0.0-beta.10) (2026-10-15)


### Features

* **auth:** add model-scoped MFA with typed behavior configuration ([#888](https://github.com/loopingz/webda.io/issues/888)) ([ee068e8](https://github.com/loopingz/webda.io/commit/ee068e879ba3b49ccfcd103c3cbb9b72a9a9a9e5))
* **auth:** TLS client certificate (mTLS) authentication ([#834](https://github.com/loopingz/webda.io/issues/834)) ([#899](https://github.com/loopingz/webda.io/issues/899)) ([5bf7996](https://github.com/loopingz/webda.io/commit/5bf7996fb9ac76506f8d1f2311f7e4453159e54e))
* delegated OAuth 2.1 tokens with operation-level consent ([#928](https://github.com/loopingz/webda.io/issues/928)) ([44709d6](https://github.com/loopingz/webda.io/commit/44709d6adea6a7e346ada3bb7bd309ef3d9a54e0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.10
    * @webda/models bumped to 4.0.0-beta.10
    * @webda/utils bumped to 4.0.0-beta.10
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.10
    * @webda/content-mapper bumped to 4.0.0-beta.9
    * @webda/fs bumped to 4.0.0-beta.10

## [4.0.0-beta.9](https://github.com/loopingz/webda.io/compare/auth-v4.0.0-beta.8...auth-v4.0.0-beta.9) (2026-10-14)


### Features

* **postgres:** read and migrate Webda 3 data in place ([#889](https://github.com/loopingz/webda.io/issues/889)) ([#895](https://github.com/loopingz/webda.io/issues/895)) ([2186dc7](https://github.com/loopingz/webda.io/commit/2186dc7f77141e2c1fae72e26d0c08a163f2bca7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.9
    * @webda/models bumped to 4.0.0-beta.9
    * @webda/utils bumped to 4.0.0-beta.9
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.9
    * @webda/content-mapper bumped to 4.0.0-beta.8
    * @webda/fs bumped to 4.0.0-beta.9

## [4.0.0-beta.8](https://github.com/loopingz/webda.io/compare/auth-v4.0.0-beta.7...auth-v4.0.0-beta.8) (2026-10-12)


### Bug Fixes

* enable strict mode in ql, oci, fs and auth ([#874](https://github.com/loopingz/webda.io/issues/874)) ([dec29f6](https://github.com/loopingz/webda.io/commit/dec29f657429eea40a21f0cae901af1e2c46074d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.8
    * @webda/models bumped to 4.0.0-beta.8
    * @webda/utils bumped to 4.0.0-beta.8
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.8
    * @webda/fs bumped to 4.0.0-beta.8
    * @webda/test bumped to 4.0.0-beta.7

## [4.0.0-beta.7](https://github.com/loopingz/webda.io/compare/auth-v4.0.0-beta.6...auth-v4.0.0-beta.7) (2026-10-11)


### Features

* stable and documented configuration secret encryption ([#837](https://github.com/loopingz/webda.io/issues/837)) ([55fad94](https://github.com/loopingz/webda.io/commit/55fad94e96537c0b44ade1cdfb88e4b5e6c6035b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.7
    * @webda/models bumped to 4.0.0-beta.7
    * @webda/utils bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.7
    * @webda/content-mapper bumped to 4.0.0-beta.7
    * @webda/fs bumped to 4.0.0-beta.7

## [4.0.0-beta.6](https://github.com/loopingz/webda.io/compare/auth-v4.0.0-beta.5...auth-v4.0.0-beta.6) (2026-10-09)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.6
    * @webda/models bumped to 4.0.0-beta.6
    * @webda/utils bumped to 4.0.0-beta.6
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.6
    * @webda/content-mapper bumped to 4.0.0-beta.6
    * @webda/fs bumped to 4.0.0-beta.6
    * @webda/test bumped to 4.0.0-beta.6

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/auth-v4.0.0-beta.4...auth-v4.0.0-beta.5) (2026-10-08)


### ⚠ BREAKING CHANGES

* **core:** models defining canAct are now enforced on REST, gRPC and MCP operations; refused calls return 403. Query pages can be shorter than their LIMIT. OwnerModel ignores a client supplied _user. ResourceAcl.canAct signature changed to (context, action) and entries need a principal.

### Bug Fixes

* **auth:** give the stub provider test helper a declarable type ([4ee513c](https://github.com/loopingz/webda.io/commit/4ee513c3ef09c1522bb5bd12f716cedf8880891f))
* **core:** enforce model permissions on every transport, deny by default ([#810](https://github.com/loopingz/webda.io/issues/810)) ([24c1182](https://github.com/loopingz/webda.io/commit/24c11824f38999ef28ec7795c8af8d0ba862d9be))
* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.5
    * @webda/models bumped to 4.0.0-beta.5
    * @webda/utils bumped to 4.0.0-beta.5
    * @webda/workout bumped to 4.0.0-beta.5
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.5
    * @webda/content-mapper bumped to 4.0.0-beta.5
    * @webda/fs bumped to 4.0.0-beta.5
    * @webda/test bumped to 4.0.0-beta.5

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/auth-v4.0.0-beta.3...auth-v4.0.0-beta.4) (2026-10-08)


### ⚠ BREAKING CHANGES

* **google-auth:** configure the provider as its own service next to Authentication (redirects.success/failure, authorized_uris); the referer whitelist, no_referer, exposeScope, project_id, the GoogleAuth.Tokens event and getLocalClient are removed.
* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800))

### Features

* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800)) ([74dc5df](https://github.com/loopingz/webda.io/commit/74dc5df103bdf93cdab92b02ef966598e44e2735))
* **google-auth:** port Google login onto @webda/auth with hardened OAuth flow ([#804](https://github.com/loopingz/webda.io/issues/804)) ([e4c4b57](https://github.com/loopingz/webda.io/commit/e4c4b570e4db6018b9891480fcac3e718e01f144))


### Bug Fixes

* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.4
    * @webda/models bumped to 4.0.0-beta.4
    * @webda/utils bumped to 4.0.0-beta.4
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/content-mapper bumped to 4.0.0-beta.4
    * @webda/fs bumped to 4.0.0-beta.4
