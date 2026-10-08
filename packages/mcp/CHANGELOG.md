# Changelog

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/mcp-v4.0.0-beta.4...mcp-v4.0.0-beta.5) (2026-10-08)


### ⚠ BREAKING CHANGES

* **core:** models defining canAct are now enforced on REST, gRPC and MCP operations; refused calls return 403. Query pages can be shorter than their LIMIT. OwnerModel ignores a client supplied _user. ResourceAcl.canAct signature changed to (context, action) and entries need a principal.

### Bug Fixes

* **core:** enforce model permissions on every transport, deny by default ([#810](https://github.com/loopingz/webda.io/issues/810)) ([24c1182](https://github.com/loopingz/webda.io/commit/24c11824f38999ef28ec7795c8af8d0ba862d9be))
* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped to 4.0.0-beta.5
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.5
    * @webda/core bumped to 4.0.0-beta.5
    * @webda/test bumped to 4.0.0-beta.5
    * @webda/utils bumped to 4.0.0-beta.5
  * peerDependencies
    * @webda/core bumped from ^4.0.0-beta.1 to ^4.0.0-beta.5

## [4.0.0-beta.4](https://github.com/loopingz/webda.io/compare/mcp-v4.0.0-beta.3...mcp-v4.0.0-beta.4) (2026-10-08)


### ⚠ BREAKING CHANGES

* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800))

### Features

* **auth:** redesign authentication with @webda/auth ([#800](https://github.com/loopingz/webda.io/issues/800)) ([74dc5df](https://github.com/loopingz/webda.io/commit/74dc5df103bdf93cdab92b02ef966598e44e2735))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.4
    * @webda/core bumped to 4.0.0-beta.4
    * @webda/utils bumped to 4.0.0-beta.4
  * peerDependencies
    * @webda/core bumped from ^4.0.0-beta.1 to ^4.0.0-beta.4

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/mcp-v4.0.0-beta.1...mcp-v4.0.0-beta.3) (2026-10-05)


### Features

* **mcp:** map model Get/Query operations to MCP resources ([2ddd34b](https://github.com/loopingz/webda.io/commit/2ddd34bdb23738c418cf2daf4f3f35869e9e3754))
* **mcp:** McpService with a Streamable HTTP endpoint and per-user MCP sessions ([d9f30b7](https://github.com/loopingz/webda.io/commit/d9f30b746c1fee94a8816ec0af6234628f9e667d))
* **mcp:** run operations as the caller and convert results to MCP tool results ([363c82f](https://github.com/loopingz/webda.io/commit/363c82ff3dde99810c96dd258d98e4ea1f48e3a2))
* **mcp:** scaffold @webda/mcp with schema inlining and the tool registry ([55a33e5](https://github.com/loopingz/webda.io/commit/55a33e577767d992a482e33414bd09184ae88a11))
* **mcp:** serve MCP tools over stdio with webda mcp --user ([e0896ff](https://github.com/loopingz/webda.io/commit/e0896ff1c5f0f0f9295efeef7a16a8fbf29d5165))
* **mcp:** serve tools and resources through the MCP SDK server ([6830dc0](https://github.com/loopingz/webda.io/commit/6830dc0f0c2e2c9816b58354c50f550e9384b04e))
* **sample-blog-system:** expose the blog over MCP and document @webda/mcp ([cff8244](https://github.com/loopingz/webda.io/commit/cff82447a9a7e9fb6b965b82456d50da8c5d91b1))


### Bug Fixes

* compiler metadata, CLI commands, cron/async hooks and long-running command lifecycle ([#785](https://github.com/loopingz/webda.io/issues/785)) ([0515715](https://github.com/loopingz/webda.io/commit/05157157c9f52af3c8df720f6630053cd2dc8b98))
* **mcp:** evict the least recently used MCP session at maxSessions instead of 503 ([b0573c7](https://github.com/loopingz/webda.io/commit/b0573c7f73690b4c1c876bcf2d06b3b90f15704f))
* **mcp:** guard the HTTP endpoint against DNS rebinding, cap MCP sessions, test 401 ([5684bff](https://github.com/loopingz/webda.io/commit/5684bffa35c084d98ebf9b95f27e958fb715c760))
* **mcp:** honor pre-aborted signals and truncate output on a UTF-8 boundary ([78eb3e8](https://github.com/loopingz/webda.io/commit/78eb3e8648251e32441b17f8208b2bec5006680d))
* **mcp:** keep optional wrapped inputs optional and tolerate malformed refs ([345e735](https://github.com/loopingz/webda.io/commit/345e73540b46a78326d7aa834ad99d98d5ddb8b6))
* **mcp:** keep stdout for protocol frames while webda mcp runs ([70574e4](https://github.com/loopingz/webda.io/commit/70574e453be13fcd09319e30420c0af6ae036ea9))
* **mcp:** mask resources/list errors and await progress notifications ([1d80a8e](https://github.com/loopingz/webda.io/commit/1d80a8e9d05fe433260afdf658b0a74220761693))
* **mcp:** parse the request host from the Host/X-Forwarded-Host header ([f399e76](https://github.com/loopingz/webda.io/commit/f399e76893b8e5cd379eb74933cab597dc989b6b))
* **mcp:** stop declaring tool outputSchema, share UTF-8-safe truncation, type-check errors ([0af2ba1](https://github.com/loopingz/webda.io/commit/0af2ba1ed156661dfdccdfd8369ce585df08dabb))
* **mcp:** validate cursor token type, escape only backslash and quote in queryFor, skip Query ops with mcp:false ([31690c2](https://github.com/loopingz/webda.io/commit/31690c29ab7b6ec7e59c667ccef9743f0eff8dc1))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @webda/workout bumped to 4.0.0-beta.3
  * devDependencies
    * @webda/compiler bumped to 4.0.0-beta.3
    * @webda/core bumped to 4.0.0-beta.3
    * @webda/test bumped to 4.0.0-beta.3
    * @webda/utils bumped to 4.0.0-beta.3
  * peerDependencies
    * @webda/core bumped from ^4.0.0-beta.1 to ^4.0.0-beta.3
