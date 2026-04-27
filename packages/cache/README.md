# @webda/cache module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/cache

> Method-level caching decorator library for Webda — annotate any method with `@ProcessCache` or `@ObjectCache` to add TTL, LRU, and statistics-aware memoization with no boilerplate.

## When to use it

- You want to cache expensive async lookups (database queries, HTTP calls) at the method level without manually managing cache state.
- You need per-instance caching (`@ObjectCache`) or process-wide shared caching (`@ProcessCache`).
- You need a custom cache scope (per async context, per request) via `createCacheAnnotation`.

## Install

```bash
pnpm add @webda/cache
```

## Configuration

`@webda/cache` is a pure TypeScript library — it has no Webda service entry and requires no `webda.config.json` entry. Import and apply the decorators directly.

| Option | Type | Default | Description |
|---|---|---|---|
| `ttl` | number | — | Time-to-live in milliseconds. Entries older than this are evicted on next access. |
| `maxSize` | number | — | Maximum entries per instance (LRU eviction when exceeded). |
| `gcInterval` | number | — | Interval in ms for automatic TTL garbage collection. |
| `enableStats` | boolean | `false` | Track hit/miss/eviction counters. |
| `hashStrategy` | `"sha256"` \| `"simple"` | `"sha256"` | Key hashing algorithm for argument fingerprinting. |
| `shouldCache` | `(result) => boolean` | — | Predicate to skip caching specific results (e.g. nulls). |
| `methodKeyGenerator` | function | — | Custom function to compute the per-call cache key. |
| `classKeyGenerator` | function | — | Custom function to compute the per-instance cache key. |

## Usage

```typescript
import { ObjectCache, ProcessCache, createCacheAnnotation } from "@webda/cache";

// Per-instance cache — each class instance has its own cache
class UserService {
  @ObjectCache({ ttl: 30000 })
  async fetchUser(id: string): Promise<User> {
    // Called at most once per unique `id` per instance within the 30s TTL
    return db.users.findById(id);
  }
}

// Process-wide cache — shared across all instances in the Node.js process
class ConfigService {
  @ProcessCache({ ttl: 60000 })
  getConfig(env: string): Config {
    return loadConfigFromDisk(env);
  }
}

// Custom cache scope (e.g. per async context / per HTTP request)
import { AsyncLocalStorage } from "async_hooks";
const storage = new AsyncLocalStorage<object>();
const RequestCache = createCacheAnnotation(() => storage.getStore() ?? null, { ttl: 5000 });

class SearchService {
  @RequestCache()
  async search(query: string): Promise<Result[]> {
    return performSearch(query);
  }
}

// Manual cache control
const service = new UserService();
ObjectCache.clear(service, "fetchUser", "123");    // clear one entry
ObjectCache.clearAll(service, "fetchUser");         // clear all entries for a method
ObjectCache.clearAll(service);                      // clear entire instance cache

// Statistics
const stats = ObjectCache.getStats();
// { hits: 42, misses: 8, evictions: 3, sets: 11 }
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/cache/`.
- Source: [`packages/cache`](https://github.com/loopingz/webda.io/tree/main/packages/cache)
- Related: [`@webda/core`](../core) for service-level caching patterns; [`@webda/decorators`](../decorators) for the underlying `createMethodDecorator` primitive used internally.

<!-- README_FOOTER -->
## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://arize.com/hubfs/arize/brand/arize-logomark-1.png" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://loopingz.com/images/logo.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://tellae.fr/" width="200">](https://tellae.fr)
