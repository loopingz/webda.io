# Changelog

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/azure-v4.0.0-beta.12...azure-v4.0.0-beta.13) (2026-11-02)


### ⚠ BREAKING CHANGES

* **otel:** @webda/otel no longer honors an incoming traceparent from any caller: list upstream services in trustedTraceSources (default []) or cross-service traces split. traceExporter.sampling now applies to the auto-instrumented HTTP and database spans (ParentBased ratio sampler). The HTTP instrumentation's incoming SERVER spans and the router span are replaced by Webda's SERVER span on every entry point. The Router emits CORS response headers for the origins of the website parameter and the CORS filters; Lambda OPTIONS without Origin no longer gets Access-Control-Max-Age/Allow-Headers. See the Upgrading section of packages/otel/README.md.

### Features

* **azure:** add Azure services, Container Apps and Functions deployers ([#998](https://github.com/loopingz/webda.io/issues/998)) ([6c7b1aa](https://github.com/loopingz/webda.io/commit/6c7b1aa386b8930c125ce5c975e74ec0c21e686b))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **otel:** on-demand web tracing (W3C trace context, X-Webda-Trace token, every entry point) ([#1029](https://github.com/loopingz/webda.io/issues/1029)) ([3d5387b](https://github.com/loopingz/webda.io/commit/3d5387bf5f1a3b505a580637daa83e1a362c23de))


### Bug Fixes

* **aws,azure:** harden Lambda/Azure request parsing, multi-value headers, and S3 key encoding ([#1044](https://github.com/loopingz/webda.io/issues/1044)) ([648ae7c](https://github.com/loopingz/webda.io/commit/648ae7cc4066ee8f10e149c115e6608b6afe1e56))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/oci bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
