# @webda/workflow module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

<!-- README_HEADER -->

> Durable workflows for Webda: a flow is a sequence of operations with control flow, that survives restarts, retries its tasks, sleeps and runs each step as the user who launched it.

## Install

```bash
pnpm add @webda/workflow
```

## Usage

```json
{
  "services": {
    "WorkflowService": {
      "type": "Webda/WorkflowService"
    }
  }
}
```

```ts
useService<WorkflowService>("WorkflowService").registerFlow({
  id: "Orders.Process",
  version: "",
  params: ["uuid"],
  input: { type: "object", properties: { uuid: { type: "string" } } },
  body: [
    {
      kind: "task",
      id: "process/Orders.Capture",
      operation: "Orders.Capture",
      input: { obj: { uuid: { var: "uuid" } } },
      options: { retries: 3 }
    },
    { kind: "task", id: "process/Workflow.Sleep", operation: "Workflow.Sleep", input: { lit: { duration: "1d" } } },
    { kind: "task", id: "process/Orders.Remind", operation: "Orders.Remind", input: { obj: { uuid: { var: "uuid" } } } }
  ],
  source: "code"
});
// The operation Orders.Process launches it and returns { uuid } of the WorkflowInstance
```

See the [documentation](https://docs.webda.io/pages/Modules/workflow/README) for the graph format, the built-in
operations, the task options and the engine parameters.
