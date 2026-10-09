---
sidebar_position: 3
---

# My First Service

A service holds behaviour that is not about a single model: integrations, scheduled work, computations across models.
Behaviour about one model belongs on the model ([My First Model](./FirstModel.md)).

A service lives in `src/services/<name>.service.ts` (the build fails on a service file without that suffix), extends
`Service` and has a parameters class.

```typescript title="src/services/task.service.ts"
import { Operation, Service, useLog } from "@webda/core";
import { Task } from "../models/Task.model.js";

/**
 * Parameters of TaskService, set in webda.config.json
 */
export class TaskServiceParameters extends Service.Parameters {
  /**
   * Maximum number of tasks counted by the summary
   * @minimum 1
   */
  maxTasks: number = 1000;
}

/**
 * Behaviour spanning several tasks
 *
 * @WebdaModda
 */
export class TaskService<T extends TaskServiceParameters = TaskServiceParameters> extends Service<T> {
  static Parameters = TaskServiceParameters;

  /**
   * Count the open and finished tasks of a project
   * @param project - project uuid
   * @returns task counts
   */
  @Operation()
  async summary(project: string): Promise<{ open: number; done: number }> {
    const { results } = await Task.query(`project = ? LIMIT ${this.parameters.maxTasks}`, [project]);
    const done = results.filter(task => task.done).length;
    useLog("INFO", "Summary of project", project);
    return { open: results.length - done, done };
  }
}
```

The `@WebdaModda` JSDoc tag registers the class as a service type. Enable it in `webda.config.json`, where its
parameters are set:

```json title="webda.config.json"
{
  "services": {
    "TaskService": {
      "type": "TaskService",
      "maxTasks": 500
    }
  }
}
```

Then run `npm run build`: the compiler generates the JSON schema of the parameters from the parameters class and its
JSDoc tags, so the configuration is validated and auto-completed.

## Beans

A service decorated with `@Bean` is a singleton of your application: it starts without being listed in
`webda.config.json`, under its class name. Beans only start when they belong to the main application, not when they
come from a dependency.

```typescript title="src/services/report.service.ts"
import { Bean, Operation, Service } from "@webda/core";

export class ReportServiceParameters extends Service.Parameters {
  /**
   * Who receives the reports
   */
  recipients: string[] = [];
}

@Bean
export class ReportService<T extends ReportServiceParameters = ReportServiceParameters> extends Service<T> {
  static Parameters = ReportServiceParameters;

  @Operation()
  async daily(): Promise<string> {
    return `Sent to ${this.parameters.recipients.length} recipients`;
  }
}
```

A bean receives the global `parameters` of the configuration. To set its own parameters, configure it under
`services` like any other service:

```json
{
  "services": {
    "ReportService": { "type": "ReportService", "recipients": ["ops@example.com"] }
  }
}
```

Set `"ignoreBeans": true` (or a list of bean names) in `parameters` to keep beans from starting.

## Lifecycle

Webda creates the services; never instantiate one with `new`.

```typescript
export class TaskService<T extends TaskServiceParameters = TaskServiceParameters> extends Service<T> {
  static Parameters = TaskServiceParameters;

  /**
   * Validate the configuration; synchronous, called before init
   */
  resolve(): this {
    super.resolve();
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

The order is: constructor → `resolve()` (configuration, dependencies) → `init()` (connections) → running → `stop()`.

## Operations

`@Operation()` exposes a method on every configured transport (REST, GraphQL, gRPC, MCP), with its input validated from
the TypeScript signature. The operation id is the configured service name, then the method name: `TaskService.Summary`.
With the REST transport:

```shell
curl -X PUT http://localhost:18080/taskservice/summary -H "Content-Type: application/json" \
  -d '{"project": "<project uuid>"}'
```

## Using other services

Reach one of your services by its configured name with `useDynamicService`:

```typescript
import { useDynamicService } from "@webda/core";
import type { TaskService } from "./task.service.js";

const summary = await useDynamicService<TaskService>("TaskService").summary(projectUuid);
```

`useService` is typed for the framework services (`Registry`, `CryptoService`...).

Read and write data through the models (`Task.create`, `Task.ref(uuid).get()`, `Task.query(...)`), never through a
store.

## Common mistakes

- `new TaskService(...)`: declare the service in `webda.config.json` (or make it a `@Bean`).
- Hardcoded URLs, credentials or delays: use parameters.
- `console.log`: use `useLog("INFO", ...)`.
- Forgetting `@WebdaModda`: the type is unknown in `webda.config.json`.

Next: the [Blog System Tutorial](./Tutorial-BlogSystem/00-Overview.md) builds a complete application.
