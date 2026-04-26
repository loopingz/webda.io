---
sidebar_position: 10
sidebar_label: Logging
---

# Logging

Webda uses structured logging via the `useLog` factory from `@webda/workout`. Every service and model should use `useLog` rather than `console.*` for consistent, filterable log output.

## `useLog(name)`

```typescript
import { useLog } from "@webda/workout";

const log = useLog("MyService");

log.info("Service started", { url: "https://api.example.com" });
log.debug("Processing item", { id: "abc123" });
log.warn("Retry attempt", { attempt: 3 });
log.error("Failed to connect", { host: "db.example.com", error: err.message });
```

## Log levels

| Method | Level | Use for |
|--------|-------|---------|
| `log.trace(msg, data?)` | TRACE | Very verbose, high-frequency internals |
| `log.debug(msg, data?)` | DEBUG | Development diagnostics |
| `log.info(msg, data?)` | INFO | Normal operational events |
| `log.warn(msg, data?)` | WARN | Unexpected but non-fatal conditions |
| `log.error(msg, data?)` | ERROR | Errors that need attention |

## Using in services

All services should declare a module-level logger:

```typescript
import { Service, ServiceParameters, Bean } from "@webda/core";
import { useLog } from "@webda/workout";

@Bean
export class PublisherService extends Service {
  protected log = useLog("PublisherService");

  async init(): Promise<this> {
    await super.init();
    this.log.info("Publisher initialized");
    return this;
  }

  async publish(slug: string, platform: string): Promise<void> {
    this.log.debug("Starting publish", { slug, platform });
    try {
      await this.doPublish(slug, platform);
      this.log.info("Published successfully", { slug, platform });
    } catch (err: any) {
      this.log.error("Publish failed", { slug, platform, error: err.message });
      throw err;
    }
  }
}
```

## Structured data logging

Pass a second argument (object) to any log method for structured context. This context is forwarded to the log sink as metadata:

```typescript
log.info("Request completed", {
  method: "POST",
  path: "/posts",
  statusCode: 201,
  durationMs: 45
});
```

Output (JSON sink):

```json
{
  "level": "info",
  "name": "PublisherService",
  "message": "Request completed",
  "method": "POST",
  "path": "/posts",
  "statusCode": 201,
  "durationMs": 45,
  "timestamp": "2026-04-25T12:00:00.000Z"
}
```

## Log sinks — `@webda/workout`

`useLog` is backed by `@webda/workout`. The default sink writes to stdout in a human-readable format during development, and can be configured for JSON output in production:

```json
{
  "parameters": {
    "log": {
      "level": "INFO",
      "format": "json"
    }
  }
}
```

Available formats: `"text"` (default, colorized), `"json"`, `"logstash"`.

## Memory log sink (testing)

The `@testWrapper` decorator in `@webda/core/test` uses the memory log sink to capture all log output during a test and write it to a `reports/` file on failure:

```typescript
import { WebdaTest } from "@webda/core/test";
import { testWrapper } from "@webda/workout";

class MyServiceTest extends WebdaTest {
  @testWrapper
  async testInit() {
    const service = await this.getService("MyService");
    // If this test fails, all logs are written to reports/MyServiceTest_testInit.log
  }
}
```

## Log correlation

In production, logs can be correlated across services using request IDs. The framework automatically adds a `requestId` field to all logs within a request context when the Router generates one.

## Do not use `console.log`

The ESLint config for Webda packages enforces using `useLog` instead of `console.*`. Using `console.log` bypasses the structured log pipeline and the memory sink (breaking test failure log capture).

## Verify

```bash
# Run @webda/workout tests
cd packages/workout
pnpm test
```

```
✓ packages/workout — all tests pass
```

## See also

- [@webda/workout README](../workout/README.md) — log sinks, formatters, and configuration
- [Services](./Services.md) — using `useLog` in service classes
- [Architecture](./Architecture.md) — logging as a cross-cutting concern
