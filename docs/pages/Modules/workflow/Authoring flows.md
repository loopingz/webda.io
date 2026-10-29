---
sidebar_label: Authoring flows
---

# Authoring flows

A flow is an `async` method of a class extending `Workflow`, in a file whose name ends with `.flow.ts`. The method
body is **never executed**: `webdac build` compiles it into the workflow graph and stores it in `webda.module.json`
under `flows`. At startup, `WorkflowService` registers every flow as an operation, with its `@Cron`s.

```ts title="src/order.flow.ts"
import { Cron, Wait, Workflow } from "@webda/workflow";

export class OrderFlows extends Workflow {
  @Cron("0 3 * * *", "Nightly reconciliation", { full: false })
  @Cron("0 4 * * 0", "Weekly full reconciliation", { full: true })
  async reconcile(full: boolean) {
    const orders = await Workflow.Call<{ uuid: string; owner: string }[]>("Order.Query", { q: "status = 'PENDING'" });
    const started = await Date.Now();
    for (const o of orders) {
      try {
        await PaymentService.Capture({ uuid: o.uuid }, { retries: 3, backoff: "exponential", timeout: "30s" });
      } catch (e) {
        await Wait.ForEvent("manual-review", { key: o.uuid, timeout: "7d" });
      }
    }
    await Workflow.Parallel(orders, order => NotifyService.Send({ to: order.owner }), { concurrency: 5 });
    await OrderFlows.Archive({ since: started });
  }

  async archive(since: number) {
    return since;
  }
}
// → operations "OrderFlows.Reconcile" (input { full: boolean }) and "OrderFlows.Archive"
```

- Each method is a flow `<Class>.<Method capitalized>`; its parameters are the flow input, its input schema is built
  like the one of an `@Operation`. A default parameter value applies when the input omits it.
- Instantiating a flow class throws `Flows run through WorkflowService`; so do the built-in stubs if called.

## Calls

Every call is awaited, as a statement or as the value of a `const`, `let` or assignment.

| Call                                                      | Becomes                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| `PaymentService.Capture(input, options?)`                 | a task running the `capture` operation of the configured service |
| `OrderFlows.Archive(input, options?)`                     | a child flow: the parent waits for it, its output is the result  |
| `Workflow.Start(OrderFlows.Archive, input)`               | a child flow started without waiting, result `{ uuid }`          |
| `Workflow.Call("Order.Query", input, options?)`           | any operation by id (string literal), untyped                    |
| `Workflow.Parallel(items, item => call, { concurrency })` | a `map`: the body (a call, or an `async` block) for each item    |
| `Promise.all([call, call])`                               | a `parallel`: the result is the array of the call results        |
| `Sleep("1h")`, `Sleep({ until })`                         | a timer                                                          |
| `Date.Now()`, `Random.Number()`, `Random.Uuid()`          | recorded values: a retry or a resume reads the same one          |
| `Wait.ForEvent(name, { key, timeout?, allow? })`          | a wait for `Workflow.Signal(name, key, payload)`                 |

**Typed calls.** `@webda/content-mapper` appends declarations to each `.flow.ts` (at the end of the file, so source
positions never move): every exported `Service` subclass of the project with `@Operation` methods is callable as
`<ServiceClass>.<Method>(input, options?)`, the input keyed by parameter name (context parameters excluded), the
result the method's return type with `Promise` unwrapped. A wrong key or type is a TypeScript error, and the build
fails. Operations of other packages and model operations go through `Workflow.Call`.

At startup, the engine resolves each typed call to the operation of the **configured** service whose instance is of
that class, whatever its name: `PaymentService.Capture` runs `Billing.Capture` when the service is configured as
`Billing`. No match, or several, stops the startup with an error naming the flow and the services.

**Task options** are an object literal of literals: `retries`, `backoff` (`"fixed"` / `"exponential"`), `delay` and
`timeout` (Duration syntax), `useSystem`.

## What a flow may contain

The body is a subset of TypeScript whose behavior in the engine is the one TypeScript gives it.

- **Statements:** `const` / `let` (one name each), assignment to a declared variable (`=` only), `if` / `else`,
  `for (const x of items)`, `while`, `try` / `catch (e)` / `finally`, `return`, `throw`, awaited calls.
- **Expressions:** literals, variables, `a.b` and `a[b]`, `== != === !== < <= > >= + - * / % && || ??`, `!`, unary `-`,
  `?:`, object and array literals (no spread, keys are names or string literals), template strings.
- **Names are unique along a scope chain:** a declaration may not shadow an enclosing variable or parameter (the
  engine keeps one set of variables per flow). The same name in two sibling blocks is fine.
- **`Workflow.Parallel` bodies** run on a copy of the variables: they may not assign a variable declared outside;
  return the value instead.
- **`throw`** takes `{ code: "...", message: "..." }` (string literals or templates, nothing else), or rethrows the
  catch variable. The catch variable holds `{ code, message, operation }` and cannot be reassigned.

Anything else is a build error with code **9101**, also shown in the editor, at the position of the construct. For
example: a call to anything that is not an operation, a flow or a built-in (`Date.now()` → "use `Date.Now()`",
`Math.random()` → "use `Random.Number()`"), `new`, an arrow function outside `Workflow.Parallel`, a module-level
variable, `for (;;)`, `switch`, `break`, `++`, `await` inside an expression, `var`, `undefined`, `this`.

## Statement ids and `@label`

Each statement gets a structural id, the key of its journal entries: `<method>/<kind>[<index in block>]`, with
`then`/`else`, `body`/`catch`/`finally` and `branch[<n>]` naming the blocks of a statement that has several, and
`/<Operation>` appended to a task (`reconcile/for[2]/try[0]/body/task[0]/PaymentService.Capture`). Adding a statement
after another never changes its id; inserting one before changes the ids of the later siblings only.

A `// @label <name>` comment directly above a statement pins its id to `<method>/<name>`, across bigger refactors. A
label is a letter followed by letters, digits, `_` or `-`, unique in the flow.

## `@Cron`

`@Cron(expression, description?, input?)` from `@webda/workflow` launches the flow on the cluster leader, as the
system; several are allowed. The build reads them statically: the expression and the description are string
literals, the input an object literal of literals. They are registered through `CronService.register`.

## Editor

The content mapper types the calls in the editor once `.flow.ts` is in its extensions:

```jsonc title="tsconfig.json"
{
  "contentMappers": [{ "package": "@webda/content-mapper", "extensions": [".model.ts", ".service.ts", ".flow.ts"] }]
}
```

`webdac build` compiles every `.flow.ts` whatever this setting.
