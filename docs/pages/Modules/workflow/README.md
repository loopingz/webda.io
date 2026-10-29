---
sidebar_label: "@webda/workflow"
---

# workflow

`@webda/workflow` runs **durable workflows**. A workflow (a _flow_) is a sequence of operations, and only
operations, with control flow: `if`, loops, `try`/`catch`, parallel branches. A flow survives restarts and deploys,
retries its failed tasks, sleeps for days, and runs each step as the user who launched it.

```bash
pnpm add @webda/workflow
```

## Concepts

- **Flow.** A `FlowDefinition`: an id (`<Class>.<Method>`, the operation launching it), the names of its parameters,
  the JSON schema of its input, and a body of statements (the _graph_).
- **Instance.** A `WorkflowInstance` is one run of a flow. It pins the definition it started with, its input, its
  status (`RUNNING`, `WAITING`, `SUCCESS`, `ERROR`, `CANCELLED`) and its **journal**: the outcome of every finished
  task.
- **Task.** A `WorkflowTask` is one attempt of one step: an operation call or a built-in.
- **Replay.** The engine never saves a program counter. After every task, it replays the flow from the top against
  the journal: a task with an outcome reads it, the first task without one is scheduled. Expressions are pure and
  `Date.Now` / `Random.*` are journaled tasks, so a replay always takes the same path.

## The graph

Everything is JSON. **Expressions** never run through `eval`:

| Expression                                | Meaning                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `{ "lit": value }`                        | a literal                                                                         |
| `{ "var": "name" }`                       | a variable                                                                        |
| `{ "get": [obj, key] }`                   | member or index access (own properties only, `undefined` on `undefined`)          |
| `{ "op": "+", "args": [a, b] }`           | `== != === !== < <= > >= + - * / % && \|\| ??` (`&&`, `\|\|`, `??` short-circuit) |
| `{ "not": e }`, `{ "neg": e }`            | `!e`, `-e`                                                                        |
| `{ "cond": [c, a, b] }`                   | `c ? a : b`                                                                       |
| `{ "obj": { "k": e } }`, `{ "arr": [e] }` | object and array literals                                                         |
| `{ "tpl": ["text ", e] }`                 | template string                                                                   |

`validateExpr(expr)` returns the paths of the invalid nodes of an untrusted expression.

**Statements** each carry a structural `id`:

| Statement  | Fields                                                                          |
| ---------- | ------------------------------------------------------------------------------- |
| `task`     | `operation`, `input`, `options?`, `assign?`                                     |
| `assign`   | `name`, `value`                                                                 |
| `if`       | `cond`, `then`, `else?`                                                         |
| `forOf`    | `item`, `items`, `body`                                                         |
| `while`    | `cond`, `body` (at most 10000 iterations, then `LoopLimit`)                     |
| `try`      | `body`, `catchVar?`, `catch?`, `finally?`                                       |
| `parallel` | `branches`, `assign?` (the array of branch return values)                       |
| `map`      | `items`, `item`, `body`, `concurrency?`, `assign?`                              |
| `return`   | `value?`                                                                        |
| `throw`    | `value` (a `FlowError` with code `FlowError`; a caught error is rethrown as is) |

Each branch of a `parallel` and each item of a `map` runs on a copy of the variables: only its `return` value comes
back. A task key is the statement id, `@`, and the indexes of the enclosing loops and branches joined by `.`
(`reconcile/for[0]/Payment.Capture@3`).

A failed task throws in the flow as plain data, `{ code, message, operation }`, that the nearest `catch` binds.

### Task options

`{ retries, backoff, delay, timeout, useSystem }`, also settable for the whole flow in `options`:

- `retries` (default `0`) more attempts, `delay` (default `"1s"`) before the first one, doubled at each attempt
  with `backoff: "exponential"` (the default) or constant with `"fixed"`. HTTP 400, 401, 403 and 404 are never
  retried.
- `timeout` aborts the `abortSignal` extension of the operation context and fails the attempt with `Timeout`.
- `useSystem` runs the task as the system (`useSystem()`) instead of the launcher.

### Built-in operations

| Built-in                       | Result                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `Date.Now`                     | ms since epoch, journaled                                                         |
| `Random.Number`, `Random.Uuid` | a number in `[0,1)`, a uuid, journaled                                            |
| `Workflow.Sleep`               | input `{ duration?: string, until?: number }`: a timer, the instance is `WAITING` |

## Launch and identity

`WorkflowService.registerFlow(def)` registers the flow as an operation: REST, MCP and `/operations/{id}` launch it,
with the launch permission checked like for any operation. The operation returns `{ uuid }` of the instance.

Each task runs through `callOperation` as the launcher: the session is rebuilt with `Session.login(userId, identId)`
at every step, so a permission revoked while the flow sleeps makes the next task fail with `Forbidden`. A flow
launched by the system runs every task as the system.

## Engine

Every replica runs a worker loop. A due task is claimed with a lease (a conditional patch on `leaseUntil`), so it
runs once even when several workers poll it. A task whose lease expired (its worker crashed) is claimed again as a
new attempt. Outcomes are written to the instance journal with a conditional patch on `revision`, retried on
conflict, so parallel branches never lose an outcome. Operations are expected to be idempotent: a task runs at least
once per attempt.

```json
{
  "services": {
    "WorkflowService": {
      "type": "Webda/WorkflowService",
      "pollInterval": 1000,
      "concurrency": 10,
      "leaseDuration": 60000,
      "maxContextSize": 262144,
      "worker": true
    }
  }
}
```

| Parameter           | Default  | Description                                                                   |
| ------------------- | -------- | ----------------------------------------------------------------------------- |
| `pollInterval`      | `1000`   | ms between two polls                                                          |
| `concurrency`       | `10`     | tasks running at once on this replica                                         |
| `leaseDuration`     | `60000`  | ms of a task lease, renewed while it runs                                     |
| `maxContextSize`    | `262144` | bytes of journal and input; over it the instance fails with `ContextTooLarge` |
| `worker`            | `true`   | run the worker loop on this replica                                           |
| `allowStoredSystem` | `false`  | allow `useSystem` tasks in stored workflows                                   |
| `flows`             |          | flow definitions to register                                                  |

`WorkflowInstance` and `WorkflowTask` are readable by their launcher and the system; every other action is refused:
they are written by the service only.

## Coming next

- **Part B:** `Wait.ForEvent` and `Workflow.Signal`, child flows and `Workflow.Start`, `cancel` / `retry` /
  `migrate`, stored `Workflow` models and flow crons. Until then these built-ins fail with `NotImplemented`.
- **Part C:** authoring flows as `.flow.ts` classes compiled to this graph.
