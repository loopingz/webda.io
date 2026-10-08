# Changelog

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
