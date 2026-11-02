:robot: I have created a release *beep* *boop*
---


<details><summary>amqp: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/amqp-v4.0.0-beta.12...amqp-v4.0.0-beta.13) (2026-11-02)


### Features

* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/utils bumped to 4.0.0-beta.12
  * devDependencies
    * @webda/bench bumped to 4.0.0-beta.13
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>async: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/async-v4.0.0-beta.12...async-v4.0.0-beta.13) (2026-11-02)


###   BREAKING CHANGES

* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996))

### Features

* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996)) ([d9ddb34](https://github.com/loopingz/webda.io/commit/d9ddb34f2ec01bece5c4ca64631e14fe6d3d6264))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))


### Bug Fixes

* **async:** enforce HMAC on statusHook and preserve caller identity in async operations ([#1031](https://github.com/loopingz/webda.io/issues/1031)) ([01d8dc9](https://github.com/loopingz/webda.io/commit/01d8dc90a52353fbc7787063a60358d774253b08))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>auth: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/auth-v4.0.0-beta.12...auth-v4.0.0-beta.13) (2026-11-02)


###   BREAKING CHANGES

* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996))

### Features

* **auth:** store the password escrow with the password change ([#1018](https://github.com/loopingz/webda.io/issues/1018)) ([712e1ef](https://github.com/loopingz/webda.io/commit/712e1ef5abe616b50062c37529fa7613428ce4c1))
* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996)) ([d9ddb34](https://github.com/loopingz/webda.io/commit/d9ddb34f2ec01bece5c4ca64631e14fe6d3d6264))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **sealed:** offline decrypt-on-read, sealed-field query warning, escrow kid precondition, set size cap ([#1022](https://github.com/loopingz/webda.io/issues/1022)) ([5be9b53](https://github.com/loopingz/webda.io/commit/5be9b53aafacda210eda0163158273444d5c471a))


### Bug Fixes

* **auth:** support canonical baseUrl for emailed links and throttle changePassword ([#1036](https://github.com/loopingz/webda.io/issues/1036)) ([217eea7](https://github.com/loopingz/webda.io/commit/217eea7d513df2b08505ce3b9205ae53e9da0223))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/content-mapper bumped to 4.0.0-beta.11
    * @webda/fs bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>aws: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/aws-v4.0.0-beta.12...aws-v4.0.0-beta.13) (2026-11-02)


###   BREAKING CHANGES

* **otel:** @webda/otel no longer honors an incoming traceparent from any caller: list upstream services in trustedTraceSources (default []) or cross-service traces split. traceExporter.sampling now applies to the auto-instrumented HTTP and database spans (ParentBased ratio sampler). The HTTP instrumentation's incoming SERVER spans and the router span are replaced by Webda's SERVER span on every entry point. The Router emits CORS response headers for the origins of the website parameter and the CORS filters; Lambda OPTIONS without Origin no longer gets Access-Control-Max-Age/Allow-Headers. See the Upgrading section of packages/otel/README.md.

### Features

* **azure:** add Azure services, Container Apps and Functions deployers ([#998](https://github.com/loopingz/webda.io/issues/998)) ([6c7b1aa](https://github.com/loopingz/webda.io/commit/6c7b1aa386b8930c125ce5c975e74ec0c21e686b))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **otel:** on-demand web tracing (W3C trace context, X-Webda-Trace token, every entry point) ([#1029](https://github.com/loopingz/webda.io/issues/1029)) ([3d5387b](https://github.com/loopingz/webda.io/commit/3d5387bf5f1a3b505a580637daa83e1a362c23de))
* read and migrate Webda 3 types in the MongoDB and DynamoDB stores ([#889](https://github.com/loopingz/webda.io/issues/889)) ([#964](https://github.com/loopingz/webda.io/issues/964)) ([a644d5c](https://github.com/loopingz/webda.io/commit/a644d5c703855869e6d16e55ffb8c3caaadc6c5b))


### Bug Fixes

* **aws,azure:** harden Lambda/Azure request parsing, multi-value headers, and S3 key encoding ([#1044](https://github.com/loopingz/webda.io/issues/1044)) ([648ae7c](https://github.com/loopingz/webda.io/commit/648ae7cc4066ee8f10e149c115e6608b6afe1e56))
* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/async bumped to 4.0.0-beta.13
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/bench bumped to 4.0.0-beta.13
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>azure: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/azure-v4.0.0-beta.12...azure-v4.0.0-beta.13) (2026-11-02)


###   BREAKING CHANGES

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
</details>

<details><summary>bench: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/bench-v4.0.0-beta.12...bench-v4.0.0-beta.13) (2026-11-02)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.9
    * @webda/utils bumped to 4.0.0-beta.12
</details>

<details><summary>cache: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/cache-v4.0.0-beta.12...cache-v4.0.0-beta.13) (2026-11-02)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/decorators bumped to 4.0.0-beta.6
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>cloudevents: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/cloudevents-v4.0.0-beta.12...cloudevents-v4.0.0-beta.13) (2026-11-02)


### Features

* **cloudevents:** CloudEventsReceiver, KnativeBrokerPubSub and Knative Trigger manifests ([#1025](https://github.com/loopingz/webda.io/issues/1025)) ([2f82dde](https://github.com/loopingz/webda.io/commit/2f82ddeec99c9d8247f9e5fe2fa911dc6050641a))


### Bug Fixes

* **cloudevents,graphql:** add CloudEvents receiver authentication and authorize GraphQL service events ([#1045](https://github.com/loopingz/webda.io/issues/1045)) ([0e14475](https://github.com/loopingz/webda.io/commit/0e144758240b012e49cd26512083bbca39bd893e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/decorators bumped to 4.0.0-beta.6
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>compiler: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/compiler-v4.0.0-beta.12...compiler-v4.0.0-beta.13) (2026-11-02)


###   BREAKING CHANGES

* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996))

### Features

* **compiler,models:** record delete policies on relations ([#982](https://github.com/loopingz/webda.io/issues/982)) ([7cd83af](https://github.com/loopingz/webda.io/commit/7cd83afd16fa5af6b6c5816bbb2f05257362bd89))
* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996)) ([d9ddb34](https://github.com/loopingz/webda.io/commit/d9ddb34f2ec01bece5c4ca64631e14fe6d3d6264))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **core:** validate symmetry of model relations and store routing ([#458](https://github.com/loopingz/webda.io/issues/458)) ([#905](https://github.com/loopingz/webda.io/issues/905)) ([3754359](https://github.com/loopingz/webda.io/commit/37543596ca25bbea2a2c1f83d0f438f047b884ec))
* **models:** add permission-aware polymorphic links ([#997](https://github.com/loopingz/webda.io/issues/997)) ([004562e](https://github.com/loopingz/webda.io/commit/004562e14b3bf47d61b29dcee5a430ae8082f4b5))
* **sealed:** offline decrypt-on-read, sealed-field query warning, escrow kid precondition, set size cap ([#1022](https://github.com/loopingz/webda.io/issues/1022)) ([5be9b53](https://github.com/loopingz/webda.io/commit/5be9b53aafacda210eda0163158273444d5c471a))


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))
* **sql:** relational store polish: review minors, @Index/@Unique, foreignKeysToJsonb, importFromJsonb ([#1023](https://github.com/loopingz/webda.io/issues/1023)) ([277555f](https://github.com/loopingz/webda.io/commit/277555fb450ef1e926cd4ace68be8cab72d116f3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/content-mapper bumped to 4.0.0-beta.11
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>content-mapper: 4.0.0-beta.11</summary>

## [4.0.0-beta.11](https://github.com/loopingz/webda.io/compare/content-mapper-v4.0.0-beta.10...content-mapper-v4.0.0-beta.11) (2026-11-02)


###   BREAKING CHANGES

* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996))

### Features

* **compiler,models:** record delete policies on relations ([#982](https://github.com/loopingz/webda.io/issues/982)) ([7cd83af](https://github.com/loopingz/webda.io/commit/7cd83afd16fa5af6b6c5816bbb2f05257362bd89))
* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996)) ([d9ddb34](https://github.com/loopingz/webda.io/commit/d9ddb34f2ec01bece5c4ca64631e14fe6d3d6264))
* **core:** validate symmetry of model relations and store routing ([#458](https://github.com/loopingz/webda.io/issues/458)) ([#905](https://github.com/loopingz/webda.io/issues/905)) ([3754359](https://github.com/loopingz/webda.io/commit/37543596ca25bbea2a2c1f83d0f438f047b884ec))
* **models:** add permission-aware polymorphic links ([#997](https://github.com/loopingz/webda.io/issues/997)) ([004562e](https://github.com/loopingz/webda.io/commit/004562e14b3bf47d61b29dcee5a430ae8082f4b5))
* **sealed:** offline decrypt-on-read, sealed-field query warning, escrow kid precondition, set size cap ([#1022](https://github.com/loopingz/webda.io/issues/1022)) ([5be9b53](https://github.com/loopingz/webda.io/commit/5be9b53aafacda210eda0163158273444d5c471a))
* **sql:** junction-attribute filters, composite references, ModelsMapped filling and the sealed @Index warning ([#1027](https://github.com/loopingz/webda.io/issues/1027)) ([b2cc2c8](https://github.com/loopingz/webda.io/commit/b2cc2c8876b40822e64eb0093aaeba0246197849)), closes [#1026](https://github.com/loopingz/webda.io/issues/1026)


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))
* **sql:** relational store polish: review minors, @Index/@Unique, foreignKeysToJsonb, importFromJsonb ([#1023](https://github.com/loopingz/webda.io/issues/1023)) ([277555f](https://github.com/loopingz/webda.io/commit/277555fb450ef1e926cd4ace68be8cab72d116f3))
</details>

<details><summary>core: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/core-v4.0.0-beta.12...core-v4.0.0-beta.13) (2026-11-02)


###   BREAKING CHANGES

* **otel:** @webda/otel no longer honors an incoming traceparent from any caller: list upstream services in trustedTraceSources (default []) or cross-service traces split. traceExporter.sampling now applies to the auto-instrumented HTTP and database spans (ParentBased ratio sampler). The HTTP instrumentation's incoming SERVER spans and the router span are replaced by Webda's SERVER span on every entry point. The Router emits CORS response headers for the origins of the website parameter and the CORS filters; Lambda OPTIONS without Origin no longer gets Access-Control-Max-Age/Allow-Headers. See the Upgrading section of packages/otel/README.md.
* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996))

### Features

* **auth:** store the password escrow with the password change ([#1018](https://github.com/loopingz/webda.io/issues/1018)) ([712e1ef](https://github.com/loopingz/webda.io/commit/712e1ef5abe616b50062c37529fa7613428ce4c1))
* **azure:** add Azure services, Container Apps and Functions deployers ([#998](https://github.com/loopingz/webda.io/issues/998)) ([6c7b1aa](https://github.com/loopingz/webda.io/commit/6c7b1aa386b8930c125ce5c975e74ec0c21e686b))
* **cloudevents:** CloudEventsReceiver, KnativeBrokerPubSub and Knative Trigger manifests ([#1025](https://github.com/loopingz/webda.io/issues/1025)) ([2f82dde](https://github.com/loopingz/webda.io/commit/2f82ddeec99c9d8247f9e5fe2fa911dc6050641a))
* **core,kubernetes:** ClusterService with leader election and whenLeader() ([#1004](https://github.com/loopingz/webda.io/issues/1004)) ([095a497](https://github.com/loopingz/webda.io/commit/095a497dbd1c12629ac32c32f6fc38127c6c85f8))
* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996)) ([d9ddb34](https://github.com/loopingz/webda.io/commit/d9ddb34f2ec01bece5c4ca64631e14fe6d3d6264))
* **core:** GlobalOperationContext and useSystem() for system operation calls ([#1003](https://github.com/loopingz/webda.io/issues/1003)) ([b5dc9ef](https://github.com/loopingz/webda.io/commit/b5dc9ef86ce6213c27e186867bdd4b7ba9c323df))
* **core:** hand the caller context to getProtectedAttributes (per-caller field write rules) ([#1020](https://github.com/loopingz/webda.io/issues/1020)) ([8118f69](https://github.com/loopingz/webda.io/commit/8118f698a2730f207f8e6623a35480d00a37ab47))
* **core:** operation transaction participants ([#980](https://github.com/loopingz/webda.io/issues/980)) ([f4d49d6](https://github.com/loopingz/webda.io/commit/f4d49d6eeae73968b379592c242cd9957f51da64))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **core:** validate symmetry of model relations and store routing ([#458](https://github.com/loopingz/webda.io/issues/458)) ([#905](https://github.com/loopingz/webda.io/issues/905)) ([3754359](https://github.com/loopingz/webda.io/commit/37543596ca25bbea2a2c1f83d0f438f047b884ec))
* **kubernetes:** KnativeDeployer with Cloud Run support, HttpServer $PORT, health route and graceful drain ([#1021](https://github.com/loopingz/webda.io/issues/1021)) ([c000a3c](https://github.com/loopingz/webda.io/commit/c000a3c454ae0afe8914c9af59da423ca9f698c7))
* **models:** add permission-aware polymorphic links ([#997](https://github.com/loopingz/webda.io/issues/997)) ([004562e](https://github.com/loopingz/webda.io/commit/004562e14b3bf47d61b29dcee5a430ae8082f4b5))
* **oauth,oidc:** shared login across applications with remote resource-bound access tokens ([#993](https://github.com/loopingz/webda.io/issues/993)) ([2c9778a](https://github.com/loopingz/webda.io/commit/2c9778ac61ec09cddd54fcbeb104d3b7c8829e63)), closes [#992](https://github.com/loopingz/webda.io/issues/992)
* **otel:** on-demand web tracing (W3C trace context, X-Webda-Trace token, every entry point) ([#1029](https://github.com/loopingz/webda.io/issues/1029)) ([3d5387b](https://github.com/loopingz/webda.io/commit/3d5387bf5f1a3b505a580637daa83e1a362c23de))
* **sealed:** offline decrypt-on-read, sealed-field query warning, escrow kid precondition, set size cap ([#1022](https://github.com/loopingz/webda.io/issues/1022)) ([5be9b53](https://github.com/loopingz/webda.io/commit/5be9b53aafacda210eda0163158273444d5c471a))


### Bug Fixes

* **core,graphql:** escape OpenAPI JSON in Swagger HTML and URLs in GraphiQL ([#1046](https://github.com/loopingz/webda.io/issues/1046)) ([11d1854](https://github.com/loopingz/webda.io/commit/11d18542ddc13a60e7aaf8e659e62ea68af254ac))
* **core:** advertise CLI requirements in operations listing ([#994](https://github.com/loopingz/webda.io/issues/994)) ([2c0264a](https://github.com/loopingz/webda.io/commit/2c0264a4063d62ddd81fbaf8ec62b58b7d53f6ae))
* **core:** answer operation results with their toDTO, as the caller ([#990](https://github.com/loopingz/webda.io/issues/990)) ([4b944b6](https://github.com/loopingz/webda.io/commit/4b944b688ab98f333eb14e802929882576fd3142))
* **core:** bind JWT cookie purpose and cap kid-derived HMAC key index ([#1032](https://github.com/loopingz/webda.io/issues/1032)) ([76d1a05](https://github.com/loopingz/webda.io/commit/76d1a05b2fe10836a87e402f33459904307051a3))
* **core:** enforce Origin check on cookie-authenticated mutations and WebSocket upgrades ([#1037](https://github.com/loopingz/webda.io/issues/1037)) ([4b7546f](https://github.com/loopingz/webda.io/commit/4b7546f374c1d0487066fc416ff3872c439c79ea))
* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))
* **sql:** relational store polish: review minors, @Index/@Unique, foreignKeysToJsonb, importFromJsonb ([#1023](https://github.com/loopingz/webda.io/issues/1023)) ([277555f](https://github.com/loopingz/webda.io/commit/277555fb450ef1e926cd4ace68be8cab72d116f3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/cache bumped to 4.0.0-beta.13
    * @webda/decorators bumped to 4.0.0-beta.6
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/content-mapper bumped to 4.0.0-beta.11
    * @webda/test bumped to 4.0.0-beta.9
  * peerDependencies
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>create: 4.0.0-beta.11</summary>

## [4.0.0-beta.11](https://github.com/loopingz/webda.io/compare/create-v4.0.0-beta.10...create-v4.0.0-beta.11) (2026-11-02)


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>debug: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/debug-v4.0.0-beta.12...debug-v4.0.0-beta.13) (2026-11-02)


### Features

* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
  * peerDependencies
    * @webda/core bumped from ^4.0.0-beta.1 to ^4.0.0-beta.13
</details>

<details><summary>decorators: 4.0.0-beta.6</summary>

## [4.0.0-beta.6](https://github.com/loopingz/webda.io/compare/decorators-v4.0.0-beta.5...decorators-v4.0.0-beta.6) (2026-11-02)


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))
</details>

<details><summary>elasticsearch: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/elasticsearch-v4.0.0-beta.12...elasticsearch-v4.0.0-beta.13) (2026-11-02)


### Bug Fixes

* **elasticsearch:** parameterize Painless script properties and prevent search index override ([#1042](https://github.com/loopingz/webda.io/issues/1042)) ([acaffc3](https://github.com/loopingz/webda.io/commit/acaffc37e4d24682fd2406bb5bc14745f6359a9c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>fs: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/fs-v4.0.0-beta.12...fs-v4.0.0-beta.13) (2026-11-02)


### Features

* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))


### Bug Fixes

* **fs:** prevent sibling-prefix path traversal and force attachment disposition on binary downloads ([#1040](https://github.com/loopingz/webda.io/issues/1040)) ([30f6f29](https://github.com/loopingz/webda.io/commit/30f6f29c8bd592aef6d80a603b6fa96040dc7c43))
* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
    * @webda/ql bumped to 4.0.0-beta.10
  * devDependencies
    * @webda/bench bumped to 4.0.0-beta.13
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>gcp: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/gcp-v4.0.0-beta.12...gcp-v4.0.0-beta.13) (2026-11-02)


### Features

* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/utils bumped to 4.0.0-beta.12
  * devDependencies
    * @webda/bench bumped to 4.0.0-beta.13
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>google-auth: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/google-auth-v4.0.0-beta.12...google-auth-v4.0.0-beta.13) (2026-11-02)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/auth bumped to 4.0.0-beta.13
    * @webda/core bumped to 4.0.0-beta.13
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/content-mapper bumped to 4.0.0-beta.11
    * @webda/test bumped to 4.0.0-beta.9
    * @webda/workout bumped to 4.0.0-beta.7
</details>

<details><summary>graphql: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/graphql-v4.0.0-beta.12...graphql-v4.0.0-beta.13) (2026-11-02)


### Features

* **core:** hand the caller context to getProtectedAttributes (per-caller field write rules) ([#1020](https://github.com/loopingz/webda.io/issues/1020)) ([8118f69](https://github.com/loopingz/webda.io/commit/8118f698a2730f207f8e6623a35480d00a37ab47))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **models:** add permission-aware polymorphic links ([#997](https://github.com/loopingz/webda.io/issues/997)) ([004562e](https://github.com/loopingz/webda.io/commit/004562e14b3bf47d61b29dcee5a430ae8082f4b5))


### Bug Fixes

* **cloudevents,graphql:** add CloudEvents receiver authentication and authorize GraphQL service events ([#1045](https://github.com/loopingz/webda.io/issues/1045)) ([0e14475](https://github.com/loopingz/webda.io/commit/0e144758240b012e49cd26512083bbca39bd893e))
* **core,graphql:** escape OpenAPI JSON in Swagger HTML and URLs in GraphiQL ([#1046](https://github.com/loopingz/webda.io/issues/1046)) ([11d1854](https://github.com/loopingz/webda.io/commit/11d18542ddc13a60e7aaf8e659e62ea68af254ac))
* **graphql:** enforce @Operation permissions, scopes, MFA, and authorizers on model CRUD ([#1030](https://github.com/loopingz/webda.io/issues/1030)) ([41159cf](https://github.com/loopingz/webda.io/commit/41159cfac871b04843f6f50829690ef6eead500b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/runtime bumped to 4.0.0-beta.13
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>grpc: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/grpc-v4.0.0-beta.12...grpc-v4.0.0-beta.13) (2026-11-02)


###   BREAKING CHANGES

* **otel:** @webda/otel no longer honors an incoming traceparent from any caller: list upstream services in trustedTraceSources (default []) or cross-service traces split. traceExporter.sampling now applies to the auto-instrumented HTTP and database spans (ParentBased ratio sampler). The HTTP instrumentation's incoming SERVER spans and the router span are replaced by Webda's SERVER span on every entry point. The Router emits CORS response headers for the origins of the website parameter and the CORS filters; Lambda OPTIONS without Origin no longer gets Access-Control-Max-Age/Allow-Headers. See the Upgrading section of packages/otel/README.md.

### Features

* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **otel:** on-demand web tracing (W3C trace context, X-Webda-Trace token, every entry point) ([#1029](https://github.com/loopingz/webda.io/issues/1029)) ([3d5387b](https://github.com/loopingz/webda.io/commit/3d5387bf5f1a3b505a580637daa83e1a362c23de))


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
  * peerDependencies
    * @webda/core bumped from ^4.0.0-beta.1 to ^4.0.0-beta.13
</details>

<details><summary>hawk: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/hawk-v4.0.0-beta.12...hawk-v4.0.0-beta.13) (2026-11-02)


### Bug Fixes

* **hawk:** prevent request filter bypass, open redirect prefix match, and unsafe origin regex ([#1038](https://github.com/loopingz/webda.io/issues/1038)) ([6025060](https://github.com/loopingz/webda.io/commit/60250609ddfaa7ac5c8114add85ef63d064b9eea))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>iam: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/iam-v4.0.0-beta.12...iam-v4.0.0-beta.13) (2026-11-02)


### Features

* **core:** GlobalOperationContext and useSystem() for system operation calls ([#1003](https://github.com/loopingz/webda.io/issues/1003)) ([b5dc9ef](https://github.com/loopingz/webda.io/commit/b5dc9ef86ce6213c27e186867bdd4b7ba9c323df))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>kubernetes: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/kubernetes-v4.0.0-beta.12...kubernetes-v4.0.0-beta.13) (2026-11-02)


### Features

* **cloudevents:** CloudEventsReceiver, KnativeBrokerPubSub and Knative Trigger manifests ([#1025](https://github.com/loopingz/webda.io/issues/1025)) ([2f82dde](https://github.com/loopingz/webda.io/commit/2f82ddeec99c9d8247f9e5fe2fa911dc6050641a))
* **core,kubernetes:** ClusterService with leader election and whenLeader() ([#1004](https://github.com/loopingz/webda.io/issues/1004)) ([095a497](https://github.com/loopingz/webda.io/commit/095a497dbd1c12629ac32c32f6fc38127c6c85f8))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **kubernetes:** KnativeDeployer with Cloud Run support, HttpServer $PORT, health route and graceful drain ([#1021](https://github.com/loopingz/webda.io/issues/1021)) ([c000a3c](https://github.com/loopingz/webda.io/commit/c000a3c454ae0afe8914c9af59da423ca9f698c7))


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/async bumped to 4.0.0-beta.13
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>mailer: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/mailer-v4.0.0-beta.12...mailer-v4.0.0-beta.13) (2026-11-02)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/templates bumped to 4.0.0-beta.13
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
    * @webda/workout bumped to 4.0.0-beta.7
</details>

<details><summary>mcp: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/mcp-v4.0.0-beta.12...mcp-v4.0.0-beta.13) (2026-11-02)


### Bug Fixes

* **mcp:** bind MCP sessions to authenticated user identity ([#1039](https://github.com/loopingz/webda.io/issues/1039)) ([aed512f](https://github.com/loopingz/webda.io/commit/aed512f02d7a936ecf1faae9cb8cf938a1c9fab2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
    * @webda/utils bumped to 4.0.0-beta.12
  * peerDependencies
    * @webda/core bumped from ^4.0.0-beta.1 to ^4.0.0-beta.13
</details>

<details><summary>mock: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/mock-v4.0.0-beta.12...mock-v4.0.0-beta.13) (2026-11-02)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/models bumped to 4.0.0-beta.13
  * devDependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
  * peerDependencies
    * @webda/core bumped to 4.0.0-beta.13
</details>

<details><summary>models: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/models-v4.0.0-beta.12...models-v4.0.0-beta.13) (2026-11-02)


### Features

* **compiler,models:** record delete policies on relations ([#982](https://github.com/loopingz/webda.io/issues/982)) ([7cd83af](https://github.com/loopingz/webda.io/commit/7cd83afd16fa5af6b6c5816bbb2f05257362bd89))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **models:** add permission-aware polymorphic links ([#997](https://github.com/loopingz/webda.io/issues/997)) ([004562e](https://github.com/loopingz/webda.io/commit/004562e14b3bf47d61b29dcee5a430ae8082f4b5))
* read and migrate Webda 3 types in the MongoDB and DynamoDB stores ([#889](https://github.com/loopingz/webda.io/issues/889)) ([#964](https://github.com/loopingz/webda.io/issues/964)) ([a644d5c](https://github.com/loopingz/webda.io/commit/a644d5c703855869e6d16e55ffb8c3caaadc6c5b))


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/serialize bumped to 4.0.0-beta.9
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
    * @webda/utils bumped to 4.0.0-beta.12
  * peerDependencies
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/utils bumped to 4.0.0-beta.12
</details>

<details><summary>mongo: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/mongo-v4.0.0-beta.12...mongo-v4.0.0-beta.13) (2026-11-02)


### Features

* read and migrate Webda 3 types in the MongoDB and DynamoDB stores ([#889](https://github.com/loopingz/webda.io/issues/889)) ([#964](https://github.com/loopingz/webda.io/issues/964)) ([a644d5c](https://github.com/loopingz/webda.io/commit/a644d5c703855869e6d16e55ffb8c3caaadc6c5b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
  * devDependencies
    * @webda/bench bumped to 4.0.0-beta.13
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>oauth: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/oauth-v4.0.0-beta.12...oauth-v4.0.0-beta.13) (2026-11-02)


### Features

* **azure:** add Azure services, Container Apps and Functions deployers ([#998](https://github.com/loopingz/webda.io/issues/998)) ([6c7b1aa](https://github.com/loopingz/webda.io/commit/6c7b1aa386b8930c125ce5c975e74ec0c21e686b))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **oauth,oidc:** shared login across applications with remote resource-bound access tokens ([#993](https://github.com/loopingz/webda.io/issues/993)) ([2c9778a](https://github.com/loopingz/webda.io/commit/2c9778ac61ec09cddd54fcbeb104d3b7c8829e63)), closes [#992](https://github.com/loopingz/webda.io/issues/992)


### Bug Fixes

* **oauth:** block MFA-pending sessions at authorize and preserve mfaAt across refresh ([#1033](https://github.com/loopingz/webda.io/issues/1033)) ([b385f56](https://github.com/loopingz/webda.io/commit/b385f5641cc551e7fe99182730ca85c86e0b73b1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/auth bumped to 4.0.0-beta.13
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/content-mapper bumped to 4.0.0-beta.11
    * @webda/fs bumped to 4.0.0-beta.13
    * @webda/mcp bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>oci: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/oci-v4.0.0-beta.12...oci-v4.0.0-beta.13) (2026-11-02)


### Features

* **azure:** add Azure services, Container Apps and Functions deployers ([#998](https://github.com/loopingz/webda.io/issues/998)) ([6c7b1aa](https://github.com/loopingz/webda.io/commit/6c7b1aa386b8930c125ce5c975e74ec0c21e686b))


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>offline: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/offline-v4.0.0-beta.12...offline-v4.0.0-beta.13) (2026-11-02)


### Features

* **core:** hand the caller context to getProtectedAttributes (per-caller field write rules) ([#1020](https://github.com/loopingz/webda.io/issues/1020)) ([8118f69](https://github.com/loopingz/webda.io/commit/8118f698a2730f207f8e6623a35480d00a37ab47))
* **sealed:** offline decrypt-on-read, sealed-field query warning, escrow kid precondition, set size cap ([#1022](https://github.com/loopingz/webda.io/issues/1022)) ([5be9b53](https://github.com/loopingz/webda.io/commit/5be9b53aafacda210eda0163158273444d5c471a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/versioning bumped to 4.0.0-beta.13
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>oidc: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/oidc-v4.0.0-beta.12...oidc-v4.0.0-beta.13) (2026-11-02)


### Features

* **azure:** add Azure services, Container Apps and Functions deployers ([#998](https://github.com/loopingz/webda.io/issues/998)) ([6c7b1aa](https://github.com/loopingz/webda.io/commit/6c7b1aa386b8930c125ce5c975e74ec0c21e686b))
* **oauth,oidc:** shared login across applications with remote resource-bound access tokens ([#993](https://github.com/loopingz/webda.io/issues/993)) ([2c9778a](https://github.com/loopingz/webda.io/commit/2c9778ac61ec09cddd54fcbeb104d3b7c8829e63)), closes [#992](https://github.com/loopingz/webda.io/issues/992)


### Bug Fixes

* **oidc:** default client user tokens without scope to empty scopes and validate mfa claims ([#1034](https://github.com/loopingz/webda.io/issues/1034)) ([b5adb3d](https://github.com/loopingz/webda.io/commit/b5adb3d24f5f39418c625f92d55f3d81598b6318))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/iam bumped to 4.0.0-beta.13
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>otel: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/otel-v4.0.0-beta.12...otel-v4.0.0-beta.13) (2026-11-02)


###   BREAKING CHANGES

* **otel:** @webda/otel no longer honors an incoming traceparent from any caller: list upstream services in trustedTraceSources (default []) or cross-service traces split. traceExporter.sampling now applies to the auto-instrumented HTTP and database spans (ParentBased ratio sampler). The HTTP instrumentation's incoming SERVER spans and the router span are replaced by Webda's SERVER span on every entry point. The Router emits CORS response headers for the origins of the website parameter and the CORS filters; Lambda OPTIONS without Origin no longer gets Access-Control-Max-Age/Allow-Headers. See the Upgrading section of packages/otel/README.md.

### Features

* **otel:** on-demand web tracing (W3C trace context, X-Webda-Trace token, every entry point) ([#1029](https://github.com/loopingz/webda.io/issues/1029)) ([3d5387b](https://github.com/loopingz/webda.io/commit/3d5387bf5f1a3b505a580637daa83e1a362c23de))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>postgres: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/postgres-v4.0.0-beta.12...postgres-v4.0.0-beta.13) (2026-11-02)


### Features

* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **postgres,sqlite:** operation-scoped transactions in the SQL stores ([#981](https://github.com/loopingz/webda.io/issues/981)) ([ebe633d](https://github.com/loopingz/webda.io/commit/ebe633d054bceebe4302161ee928dc61374f7ab1))
* **postgres:** PostgresRelationalStore  typed tables, foreign keys and junctions from the sql-schema plan ([#1009](https://github.com/loopingz/webda.io/issues/1009)) ([4a823af](https://github.com/loopingz/webda.io/commit/4a823affc982288e86680bedc48198dce294b7d0))
* **sqlite:** SQLiteRelationalStore on the shared relational layer ([#1012](https://github.com/loopingz/webda.io/issues/1012)) ([9de054d](https://github.com/loopingz/webda.io/commit/9de054d55d07c30ff51c70eff8ed2464bc82bffb))
* **sql:** junction-attribute filters, composite references, ModelsMapped filling and the sealed @Index warning ([#1027](https://github.com/loopingz/webda.io/issues/1027)) ([b2cc2c8](https://github.com/loopingz/webda.io/commit/b2cc2c8876b40822e64eb0093aaeba0246197849)), closes [#1026](https://github.com/loopingz/webda.io/issues/1026)
* **sql:** multi-version schema registry for the relational stores ([#1016](https://github.com/loopingz/webda.io/issues/1016)) ([#1024](https://github.com/loopingz/webda.io/issues/1024)) ([1a895d0](https://github.com/loopingz/webda.io/commit/1a895d0dcbfe6dce4c33e1e665e01639f40ada92))


### Bug Fixes

* **postgres,sqlite:** parameterize JSON path segments and validate array indices ([#1041](https://github.com/loopingz/webda.io/issues/1041)) ([6092bd3](https://github.com/loopingz/webda.io/commit/6092bd3bc333de7babcf84aeb0759987b2bfce9a))
* **sql:** relational store polish: review minors, @Index/@Unique, foreignKeysToJsonb, importFromJsonb ([#1023](https://github.com/loopingz/webda.io/issues/1023)) ([277555f](https://github.com/loopingz/webda.io/commit/277555fb450ef1e926cd4ace68be8cab72d116f3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/sql bumped to 4.0.0-beta.5
    * @webda/sql-schema bumped to 4.0.0-beta.2
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/bench bumped to 4.0.0-beta.13
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>ql: 4.0.0-beta.10</summary>

## [4.0.0-beta.10](https://github.com/loopingz/webda.io/compare/ql-v4.0.0-beta.9...ql-v4.0.0-beta.10) (2026-11-02)


### Features

* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))


### Bug Fixes

* **ql,serialize:** block prototype key access in WebdaQL/serializer and bound LIKE regexes ([#1043](https://github.com/loopingz/webda.io/issues/1043)) ([d581516](https://github.com/loopingz/webda.io/commit/d5815160aca1a8bfbe8d45ce0a56fa0d13b05527))
* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/utils bumped to 4.0.0-beta.12
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>runtime: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/runtime-v4.0.0-beta.12...runtime-v4.0.0-beta.13) (2026-11-02)


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>sdk: 4.0.0-beta.6</summary>

## [4.0.0-beta.6](https://github.com/loopingz/webda.io/compare/sdk-v4.0.0-beta.5...sdk-v4.0.0-beta.6) (2026-11-02)


###   BREAKING CHANGES

* **otel:** @webda/otel no longer honors an incoming traceparent from any caller: list upstream services in trustedTraceSources (default []) or cross-service traces split. traceExporter.sampling now applies to the auto-instrumented HTTP and database spans (ParentBased ratio sampler). The HTTP instrumentation's incoming SERVER spans and the router span are replaced by Webda's SERVER span on every entry point. The Router emits CORS response headers for the origins of the website parameter and the CORS filters; Lambda OPTIONS without Origin no longer gets Access-Control-Max-Age/Allow-Headers. See the Upgrading section of packages/otel/README.md.
* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996))

### Features

* **compiler,models:** record delete policies on relations ([#982](https://github.com/loopingz/webda.io/issues/982)) ([7cd83af](https://github.com/loopingz/webda.io/commit/7cd83afd16fa5af6b6c5816bbb2f05257362bd89))
* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996)) ([d9ddb34](https://github.com/loopingz/webda.io/commit/d9ddb34f2ec01bece5c4ca64631e14fe6d3d6264))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **core:** validate symmetry of model relations and store routing ([#458](https://github.com/loopingz/webda.io/issues/458)) ([#905](https://github.com/loopingz/webda.io/issues/905)) ([3754359](https://github.com/loopingz/webda.io/commit/37543596ca25bbea2a2c1f83d0f438f047b884ec))
* **otel:** on-demand web tracing (W3C trace context, X-Webda-Trace token, every entry point) ([#1029](https://github.com/loopingz/webda.io/issues/1029)) ([3d5387b](https://github.com/loopingz/webda.io/commit/3d5387bf5f1a3b505a580637daa83e1a362c23de))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/graphql bumped to 4.0.0-beta.13
    * @webda/grpc bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/offline bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/test bumped to 4.0.0-beta.9
  * peerDependencies
    * @webda/graphql bumped to 4.0.0-beta.13
    * @webda/grpc bumped to 4.0.0-beta.13
    * @webda/offline bumped to 4.0.0-beta.13
</details>

<details><summary>sealed-client: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/sealed-client-v4.0.0-beta.12...sealed-client-v4.0.0-beta.13) (2026-11-02)


###   BREAKING CHANGES

* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996))

### Features

* **auth:** store the password escrow with the password change ([#1018](https://github.com/loopingz/webda.io/issues/1018)) ([712e1ef](https://github.com/loopingz/webda.io/commit/712e1ef5abe616b50062c37529fa7613428ce4c1))
* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996)) ([d9ddb34](https://github.com/loopingz/webda.io/commit/d9ddb34f2ec01bece5c4ca64631e14fe6d3d6264))
* **sealed:** offline decrypt-on-read, sealed-field query warning, escrow kid precondition, set size cap ([#1022](https://github.com/loopingz/webda.io/issues/1022)) ([5be9b53](https://github.com/loopingz/webda.io/commit/5be9b53aafacda210eda0163158273444d5c471a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
</details>

<details><summary>serialize: 4.0.0-beta.9</summary>

## [4.0.0-beta.9](https://github.com/loopingz/webda.io/compare/serialize-v4.0.0-beta.8...serialize-v4.0.0-beta.9) (2026-11-02)


### Bug Fixes

* **ql,serialize:** block prototype key access in WebdaQL/serializer and bound LIKE regexes ([#1043](https://github.com/loopingz/webda.io/issues/1043)) ([d581516](https://github.com/loopingz/webda.io/commit/d5815160aca1a8bfbe8d45ce0a56fa0d13b05527))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>sql: 4.0.0-beta.5</summary>

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/sql-v4.0.0-beta.4...sql-v4.0.0-beta.5) (2026-11-02)


### Features

* **postgres,sqlite:** operation-scoped transactions in the SQL stores ([#981](https://github.com/loopingz/webda.io/issues/981)) ([ebe633d](https://github.com/loopingz/webda.io/commit/ebe633d054bceebe4302161ee928dc61374f7ab1))
* **postgres:** PostgresRelationalStore  typed tables, foreign keys and junctions from the sql-schema plan ([#1009](https://github.com/loopingz/webda.io/issues/1009)) ([4a823af](https://github.com/loopingz/webda.io/commit/4a823affc982288e86680bedc48198dce294b7d0))
* **sqlite:** SQLiteRelationalStore on the shared relational layer ([#1012](https://github.com/loopingz/webda.io/issues/1012)) ([9de054d](https://github.com/loopingz/webda.io/commit/9de054d55d07c30ff51c70eff8ed2464bc82bffb))
* **sql:** junction-attribute filters, composite references, ModelsMapped filling and the sealed @Index warning ([#1027](https://github.com/loopingz/webda.io/issues/1027)) ([b2cc2c8](https://github.com/loopingz/webda.io/commit/b2cc2c8876b40822e64eb0093aaeba0246197849)), closes [#1026](https://github.com/loopingz/webda.io/issues/1026)
* **sql:** multi-version schema registry for the relational stores ([#1016](https://github.com/loopingz/webda.io/issues/1016)) ([#1024](https://github.com/loopingz/webda.io/issues/1024)) ([1a895d0](https://github.com/loopingz/webda.io/commit/1a895d0dcbfe6dce4c33e1e665e01639f40ada92))


### Bug Fixes

* **sql:** relational store polish: review minors, @Index/@Unique, foreignKeysToJsonb, importFromJsonb ([#1023](https://github.com/loopingz/webda.io/issues/1023)) ([277555f](https://github.com/loopingz/webda.io/commit/277555fb450ef1e926cd4ace68be8cab72d116f3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/sql-schema bumped to 4.0.0-beta.2
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>sql-schema: 4.0.0-beta.2</summary>

## [4.0.0-beta.2](https://github.com/loopingz/webda.io/compare/sql-schema-v4.0.0-beta.1...sql-schema-v4.0.0-beta.2) (2026-11-02)


### Features

* **compiler,models:** record delete policies on relations ([#982](https://github.com/loopingz/webda.io/issues/982)) ([7cd83af](https://github.com/loopingz/webda.io/commit/7cd83afd16fa5af6b6c5816bbb2f05257362bd89))
* **postgres:** PostgresRelationalStore  typed tables, foreign keys and junctions from the sql-schema plan ([#1009](https://github.com/loopingz/webda.io/issues/1009)) ([4a823af](https://github.com/loopingz/webda.io/commit/4a823affc982288e86680bedc48198dce294b7d0))
* **sql:** junction-attribute filters, composite references, ModelsMapped filling and the sealed @Index warning ([#1027](https://github.com/loopingz/webda.io/issues/1027)) ([b2cc2c8](https://github.com/loopingz/webda.io/commit/b2cc2c8876b40822e64eb0093aaeba0246197849)), closes [#1026](https://github.com/loopingz/webda.io/issues/1026)
* **sql:** multi-version schema registry for the relational stores ([#1016](https://github.com/loopingz/webda.io/issues/1016)) ([#1024](https://github.com/loopingz/webda.io/issues/1024)) ([1a895d0](https://github.com/loopingz/webda.io/commit/1a895d0dcbfe6dce4c33e1e665e01639f40ada92))


### Bug Fixes

* **sql:** relational store polish: review minors, @Index/@Unique, foreignKeysToJsonb, importFromJsonb ([#1023](https://github.com/loopingz/webda.io/issues/1023)) ([277555f](https://github.com/loopingz/webda.io/commit/277555fb450ef1e926cd4ace68be8cab72d116f3))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/models bumped to 4.0.0-beta.13
  * peerDependencies
    * @webda/models bumped to 4.0.0-beta.13
</details>

<details><summary>sqlite: 4.0.0-beta.5</summary>

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/sqlite-v4.0.0-beta.4...sqlite-v4.0.0-beta.5) (2026-11-02)


### Features

* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))
* **postgres,sqlite:** operation-scoped transactions in the SQL stores ([#981](https://github.com/loopingz/webda.io/issues/981)) ([ebe633d](https://github.com/loopingz/webda.io/commit/ebe633d054bceebe4302161ee928dc61374f7ab1))
* **sqlite:** SQLiteRelationalStore on the shared relational layer ([#1012](https://github.com/loopingz/webda.io/issues/1012)) ([9de054d](https://github.com/loopingz/webda.io/commit/9de054d55d07c30ff51c70eff8ed2464bc82bffb))
* **sql:** junction-attribute filters, composite references, ModelsMapped filling and the sealed @Index warning ([#1027](https://github.com/loopingz/webda.io/issues/1027)) ([b2cc2c8](https://github.com/loopingz/webda.io/commit/b2cc2c8876b40822e64eb0093aaeba0246197849)), closes [#1026](https://github.com/loopingz/webda.io/issues/1026)
* **sql:** multi-version schema registry for the relational stores ([#1016](https://github.com/loopingz/webda.io/issues/1016)) ([#1024](https://github.com/loopingz/webda.io/issues/1024)) ([1a895d0](https://github.com/loopingz/webda.io/commit/1a895d0dcbfe6dce4c33e1e665e01639f40ada92))


### Bug Fixes

* **postgres,sqlite:** parameterize JSON path segments and validate array indices ([#1041](https://github.com/loopingz/webda.io/issues/1041)) ([6092bd3](https://github.com/loopingz/webda.io/commit/6092bd3bc333de7babcf84aeb0759987b2bfce9a))
* **sql:** relational store polish: review minors, @Index/@Unique, foreignKeysToJsonb, importFromJsonb ([#1023](https://github.com/loopingz/webda.io/issues/1023)) ([277555f](https://github.com/loopingz/webda.io/commit/277555fb450ef1e926cd4ace68be8cab72d116f3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/sql bumped to 4.0.0-beta.5
    * @webda/sql-schema bumped to 4.0.0-beta.2
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/bench bumped to 4.0.0-beta.13
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>templates: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/templates-v4.0.0-beta.12...templates-v4.0.0-beta.13) (2026-11-02)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
    * @webda/workout bumped to 4.0.0-beta.7
</details>

<details><summary>test: 4.0.0-beta.9</summary>

## [4.0.0-beta.9](https://github.com/loopingz/webda.io/compare/test-v4.0.0-beta.8...test-v4.0.0-beta.9) (2026-11-02)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/decorators bumped to 4.0.0-beta.6
    * @webda/workout bumped to 4.0.0-beta.7
</details>

<details><summary>utils: 4.0.0-beta.12</summary>

## [4.0.0-beta.12](https://github.com/loopingz/webda.io/compare/utils-v4.0.0-beta.11...utils-v4.0.0-beta.12) (2026-11-02)


###   BREAKING CHANGES

* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996))

### Features

* **azure:** add Azure services, Container Apps and Functions deployers ([#998](https://github.com/loopingz/webda.io/issues/998)) ([6c7b1aa](https://github.com/loopingz/webda.io/commit/6c7b1aa386b8930c125ce5c975e74ec0c21e686b))
* **core:** complete action REST bindings and OpenAPI ([#996](https://github.com/loopingz/webda.io/issues/996)) ([d9ddb34](https://github.com/loopingz/webda.io/commit/d9ddb34f2ec01bece5c4ca64631e14fe6d3d6264))
* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/decorators bumped to 4.0.0-beta.6
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>versioning: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/versioning-v4.0.0-beta.12...versioning-v4.0.0-beta.13) (2026-11-02)


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/test bumped to 4.0.0-beta.9
  * peerDependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
</details>

<details><summary>workflow: 4.0.0-beta.13</summary>

## [4.0.0-beta.13](https://github.com/loopingz/webda.io/compare/workflow-v4.0.0-beta.12...workflow-v4.0.0-beta.13) (2026-11-02)


### Features

* **core:** refuse to start when a [@webda](https://github.com/webda) package is loaded twice ([#965](https://github.com/loopingz/webda.io/issues/965)) ([b67f2d4](https://github.com/loopingz/webda.io/commit/b67f2d43192591f25e6c99a6fe575e64d3a519d2))


### Bug Fixes

* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))
* **workflow:** preserve caller scopes/clientId across workflow steps and bound expressions ([#1035](https://github.com/loopingz/webda.io/issues/1035)) ([0eed388](https://github.com/loopingz/webda.io/commit/0eed388f8c274c2c873fb934d17dfe06a77a6c2d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/core bumped to 4.0.0-beta.13
    * @webda/models bumped to 4.0.0-beta.13
    * @webda/ql bumped to 4.0.0-beta.10
    * @webda/utils bumped to 4.0.0-beta.12
    * @webda/workout bumped to 4.0.0-beta.7
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.13
    * @webda/content-mapper bumped to 4.0.0-beta.11
    * @webda/test bumped to 4.0.0-beta.9
</details>

<details><summary>workout: 4.0.0-beta.7</summary>

## [4.0.0-beta.7](https://github.com/loopingz/webda.io/compare/workout-v4.0.0-beta.6...workout-v4.0.0-beta.7) (2026-11-02)


### Bug Fixes

* remediate CodeQL security and quality alerts ([#995](https://github.com/loopingz/webda.io/issues/995)) ([3ce3fb3](https://github.com/loopingz/webda.io/commit/3ce3fb31f879f0508b2cb83b34bd554c47b294e4))
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).