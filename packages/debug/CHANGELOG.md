# Changelog

## [4.0.0](https://github.com/loopingz/webda.io/compare/debug-v4.0.0-beta.1...debug-v4.0.0) (2026-05-09)


### Features

* add @webda/debug package — introspection API + WebSocket live events ([#750](https://github.com/loopingz/webda.io/issues/750)) ([307b2f2](https://github.com/loopingz/webda.io/commit/307b2f2267f2eacd1be8ec4a44f47999e0c61931))
* add Behavior and move Binary to Behavior ([ef05efb](https://github.com/loopingz/webda.io/commit/ef05efb3c7910d014336d3a3a0a102dfff38a1b6))
* blog-system Binary/Binaries demo + e2e suite, with framework fixes ([#771](https://github.com/loopingz/webda.io/issues/771)) ([fe7e187](https://github.com/loopingz/webda.io/commit/fe7e18786744134fb29447a9f139689abbbd4950))
* **debug:** capture request/response details + 4xx error UX fixes ([#769](https://github.com/loopingz/webda.io/issues/769)) ([9709f47](https://github.com/loopingz/webda.io/commit/9709f47defe62b38788454734c88210641f5506a))
* default REST routes for operations, bean service fixes ([#755](https://github.com/loopingz/webda.io/issues/755)) ([ccebecf](https://github.com/loopingz/webda.io/commit/ccebecfe37fe5417f36a689fe4973901e450c82a))
* enhance debug panels ([#759](https://github.com/loopingz/webda.io/issues/759)) ([63e6e0c](https://github.com/loopingz/webda.io/commit/63e6e0c3bd7d72fb06b148c7344eb3021d186ae9))
* operation return values, HttpServer routing, and models fixes ([#754](https://github.com/loopingz/webda.io/issues/754)) ([0779301](https://github.com/loopingz/webda.io/commit/0779301fbcf066dcac1362396842b9aae65b6e59))
* operations system — decouple operations from transport ([#753](https://github.com/loopingz/webda.io/issues/753)) ([54f3151](https://github.com/loopingz/webda.io/commit/54f3151686b9115221790e90c3ee723fb0b8c873))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped to 4.0.0
  * devDependencies
    * @webda/compiler bumped to 4.0.0
    * @webda/core bumped to 4.0.0
    * @webda/tsc-esm bumped to 4.0.0
    * @webda/test bumped to 4.0.0
  * peerDependencies
    * @webda/core bumped from ^4.0.0-beta.1 to ^4.0.0
