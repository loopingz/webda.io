---
sidebar_position: 10
sidebar_label: Logging
---

# Logging

Webda logs through `@webda/workout`. Every service and model should log through it rather than `console.*` so the output goes through the configured logger services and the test memory logger.

## `useLog(level, ...args)`

```typescript
import { useLog } from "@webda/workout"; // also re-exported by @webda/core

useLog("INFO", "Service started", "https://api.example.com");
useLog("DEBUG", "Processing item", { id: "abc123" });
useLog("WARN", "Retry attempt", 3);
useLog("ERROR", "Failed to connect", err);
```

To tag the logs with a class name, use `useLogger(name)` from `@webda/core`: it returns a `Logger` whose `log(level, ...args)` adds `{ class: name }` to the log context.

```typescript
import { useLogger } from "@webda/core";

const logger = useLogger("MyHelper");
logger.log("INFO", "Started");
```

## Log levels

| Level   | Use for                                |
| ------- | -------------------------------------- |
| `TRACE` | Very verbose, high-frequency internals |
| `DEBUG` | Development diagnostics                |
| `INFO`  | Normal operational events              |
| `WARN`  | Unexpected but non-fatal conditions    |
| `ERROR` | Errors that need attention             |

## Using in services

`Service` has a `log(level, ...args)` method that prefixes the message with the service name:

```typescript
import { Service, Bean } from "@webda/core";

@Bean
export class PublisherService extends Service {
  async init(): Promise<this> {
    await super.init();
    this.log("INFO", "Publisher initialized");
    return this;
  }

  async publish(slug: string, platform: string): Promise<void> {
    this.log("DEBUG", "Starting publish", slug, platform);
    try {
      await this.doPublish(slug, platform);
      this.log("INFO", "Published successfully", slug, platform);
    } catch (err: any) {
      this.log("ERROR", "Publish failed", slug, platform, err);
      throw err;
    }
  }
}
```

## Logger services

The log output is configured with logger services: `ConsoleLogger` (stdout), `FileLogger` (a file, with `sizeLimit` rotation) and `Webda/MemoryLogger` (in memory, `limit` entries). They all take `logLevel` (default: the `LOG_LEVEL` environment variable, else `INFO`) and the console and file loggers take a sprintf `format` (default `%(d)s [%(l)s] %(m)s`):

```json
{
  "services": {
    "consoleLogger": {
      "type": "ConsoleLogger",
      "logLevel": "INFO"
    },
    "fileLogger": {
      "type": "FileLogger",
      "file": "./logs/webda.log",
      "logLevel": "DEBUG"
    }
  }
}
```

## Memory log sink (testing)

`WebdaTest` (from `@webda/core/lib/test`, base of `WebdaApplicationTest`) wraps every test with a memory logger. When the test fails, or when the `WEBDA_TEST_LOGS` environment variable is set, the logs are written to `.webda/tests/<Suite>/<test>.log`:

```typescript
import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test";

@suite
class MyServiceTest extends WebdaApplicationTest {
  @test
  async testInit() {
    const service = this.getService("MyService");
    // If this test fails, all logs are written to .webda/tests/MyServiceTest/testInit.log
  }
}
```

## Do not use `console.log`

Using `console.log` bypasses the logger services and the memory logger (breaking test failure log capture).

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
- [Services](./Services.md) — logging from service classes
- [Architecture](./Architecture.md) — logging as a cross-cutting concern
