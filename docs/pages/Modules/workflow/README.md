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
- `timeout` aborts the attempt's abort signal and fails the attempt with `Timeout`.
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

### Stopping an attempt

An operation run by a workflow reads the abort signal of its attempt with `useAbortSignal()`:

```ts
import { useAbortSignal } from "@webda/workflow";

@Operation()
async capture(uuid: string) {
  const signal = useAbortSignal(); // undefined outside a workflow task
  return fetch(`https://payments/${uuid}/capture`, { method: "POST", signal });
}
```

The signal is aborted on `timeout`, when the worker loses the task lease, and when the service stops. Operations
should observe it to stop early. An attempt that ignores it keeps running, its outcome is ignored, and the task may
run again: operations are assumed to be idempotent.

## Engine

Every replica runs a worker loop. A due task is claimed with a lease (a conditional patch on `leaseUntil`), so it
runs once even when several workers poll it. A task whose lease expired (its worker crashed) is claimed again as a
new attempt; a task abandoned by its worker more than `retries + 1` times fails with `Crashed`. Every write of an
attempt is conditional on the lease its worker holds: a worker that lost the lease (too slow, reclaimed by another)
aborts the attempt and drops its outcome. A step whose outcome is already journaled never runs again. Outcomes are written to the instance journal with a conditional patch on `revision`, retried on
conflict, so parallel branches never lose an outcome. Operations are expected to be idempotent: a task runs at least
once per attempt.

A recovery sweep, every `sweepInterval`, replays the active instances not updated for `sweepInterval` that have no
pending or running task (a crash between two steps). `stop()` waits for the poll in flight and claims nothing more,
gives the running attempts `stopTimeout` to finish, then aborts them without writing their outcome: their lease
expires and another worker runs them again.

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
| `sweepInterval`     | `60000`  | ms between two recovery sweeps, and age of the instances they replay          |
| `stopTimeout`       | `30000`  | ms `stop()` waits for the running attempts before aborting them               |
| `allowStoredSystem` | `false`  | allow `useSystem` tasks in stored workflows                                   |
| `flows`             |          | flow definitions to register                                                  |

`WorkflowInstance` and `WorkflowTask` are readable by their launcher and the system; every other action is refused:
they are written by the service only.

## Signals

`Wait.ForEvent` with input `{ name, key, timeout?, allow? }` parks the instance (`WAITING`) until a signal on
`(name, key)` arrives; the signal payload is the result of the task. Its `timeout` (Duration) throws `Timeout` in the
flow, which a `try`/`catch` handles.

`Workflow.Signal` (`POST /workflows/signal`, `{ event, key, payload }`) resolves every wait on `(event, key)` whose
instance accepts the sender, and returns `{ delivered }`:

- the caller must be authenticated (or the system); the payload is at most `maxSignalPayload` bytes of JSON;
- the launcher, the system and the users listed in the wait `allow` may signal it. A sender no wait accepts gets
  `{ delivered: 0 }`, the same answer as when nothing waits, so pending waits cannot be probed;
- a signal sent before any wait is buffered as a `WorkflowSignal` for `signalTtl` (default `1d`), at most
  `maxBufferedSignals` per `(event, key)` (a new one past it is refused with `TooManyRequests`). The first wait on
  the same `(event, key)` consumes it if its instance accepts the sender at that moment; a signal that loses the
  race for a wait stays buffered. The recovery sweep purges the expired ones;
- a wait resolves once: two signals at the same time deliver one.

## Child flows

- A task whose operation is a flow (`{ "kind": "task", "operation": "Orders.Archive", "input": { ... } }`) starts a
  **child instance** and waits for it: the child runs as the same launcher and pins the current definition of its
  flow. Its output is the task result; its error (or `Cancelled`) throws in the parent.
- `Workflow.Start` with input `{ flow, input }` starts a child without waiting: its result is `{ uuid }` at once.
- Starting a child checks the flow operation permission and authorizers for the child's launcher, like a launch: a
  refusal fails the task with `Forbidden`. A stored flow started by a system instance runs as its last saver.

## Controls

`WorkflowInstance` actions, allowed to the launcher and the system:

- `cancel()`: the instance, its live tasks and the children it waits on become `CANCELLED`. A running attempt is
  aborted (`useAbortSignal()`), and a late outcome is dropped.
- `retry()`, from `ERROR`: drops the outcome that failed the flow and every outcome journaled after it, then replays.
  The steps before it are not run again.
- `migrate(version?)`, while running: moves the instance to another version of its flow (the latest when omitted). It
  is refused with `BadRequest` when a journaled or pending task of the instance has no statement in the target graph.

## Stored workflows

A `Workflow` model (exported as `StoredWorkflow`) holds a flow defined at runtime: `name` (its operation id),
`params`, `input` (JSON schema), `body`, `options` and `crons` (`[{ cron, description?, input? }]`). The engine runs
it exactly like a code flow, through `/operations/{name}`.

- **Validated on save**: the name is an operation id that is neither a code flow nor another operation, every
  statement kind is known, every expression passes `validateExpr`, every task operation exists. `version` and
  `updatedBy` (the user saving) are set on save.
- **`useSystem` is refused** in a stored workflow, for every user, unless `allowStoredSystem` is set: otherwise anyone
  allowed to save a workflow would run operations as the system.
- **Permissions**: any authenticated user reads; create, update and delete need the role `storedWorkflowRole`
  (default `workflow-admin`); the system may do anything.
- **Crons** run as the user who saved the workflow last, never as the system. A code flow launched by a cron runs as
  the system.
- Editing a workflow does not change the running instances: they keep their pinned definition.
- Partial updates (increments, collection items, attribute removal) are refused: a stored workflow changes through
  update or patch, which validate it. Every registration (boot, sync, pubsub) validates it again: an invalid one, or
  one whose name became another operation (a module enabled later), is skipped with an ERROR log and never replaces
  that operation or its crons.
- **Replicas**: with `syncPubSub` (a PubSub service), a save is announced to every replica; otherwise every replica
  reloads the stored workflows every `syncInterval` (default `60000` ms).

| Parameter            | Default            | Description                                                          |
| -------------------- | ------------------ | -------------------------------------------------------------------- |
| `signalTtl`          | `"1d"`             | how long an early signal is kept                                     |
| `storedWorkflowRole` | `"workflow-admin"` | role writing stored workflows                                        |
| `syncPubSub`         |                    | PubSub service announcing stored workflow changes                    |
| `syncInterval`       | `60000`            | ms between two reloads of the stored workflows, without `syncPubSub` |

## Coming next

- **Part C:** authoring flows as `.flow.ts` classes compiled to this graph, with `@Cron` on flow methods.
