---
name: webda-services
description: Use when adding or changing a Webda service, its parameters, its lifecycle or when wiring it in webda.config.json
---

# Webda services

## When to use

Behaviour that is not about a single model: integrations, scheduled work, computations across models. Model-specific behaviour belongs on the model.

## Pattern

A service lives in `src/services/<name>.service.ts`, has a parameters class (the file must be named `*.service.ts`: the build fails on a service file without that suffix), and the `@WebdaModda` JSDoc tag so the compiler registers it. It is enabled in `webda.config.json` under `services`, where its parameters are set.

```ts
import { Service, useLog } from "@webda/core";

export class ReminderServiceParameters extends Service.Parameters {
  /**
   * Hours before a reminder is sent
   * @minimum 1
   */
  delayHours: number = 24;
}

/**
 * Sends reminders for open tasks
 *
 * @WebdaModda
 */
export class ReminderService<T extends ReminderServiceParameters = ReminderServiceParameters> extends Service<T> {
  static Parameters = ReminderServiceParameters;

  /**
   * Validate configuration; synchronous, called before init
   */
  resolve(): this {
    super.resolve();
    useLog("INFO", "Reminder delay", this.parameters.delayHours);
    return this;
  }

  /**
   * Open connections or start timers
   */
  async init(): Promise<this> {
    await super.init();
    return this;
  }

  /**
   * Release what init created
   */
  async stop(): Promise<void> {
    await super.stop();
  }
}
```

```json
{
  "services": {
    "ReminderService": { "type": "ReminderService", "delayHours": 12 }
  }
}
```

Lifecycle: constructor → `resolve()` (configuration, dependencies) → `init()` (connections) → running → `stop()`.

Another service is reached with `useService("ReminderService")`. Expose a method to clients with `@Operation()` (see `webda-operations`).

## Common mistakes

```text
new ReminderService(...)                → never instantiate services; declare them in webda.config.json
Hardcoded URLs, credentials, delays     → parameters in webda.config.json
console.log                              → useLog("INFO", ...)
Forgetting @WebdaModda                  → the type is unknown in webda.config.json
```

## Verify

`npm run build`, then `npm run debug` and check the service starts in the logs; add a test (see `webda-testing`).

## Reference

https://docs.webda.io

Written for Webda 4.0.0-beta.
