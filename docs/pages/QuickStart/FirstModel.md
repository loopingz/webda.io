---
sidebar_position: 2
---

# My First Model

A model is a class in `src/models/<Name>.model.ts` extending `UuidModel` (generated `uuid` key) or `Model` (your own
key) from `@webda/models`. Fields are class properties; validation comes from JSDoc tags, which the compiler turns into
the JSON schema.

```typescript title="src/models/Task.model.ts"
import type { IOperationContext } from "@webda/core";
import { UuidModel } from "@webda/models";

/**
 * A task to do
 */
export class Task extends UuidModel {
  /**
   * What needs to be done
   * @minLength 1
   * @maxLength 200
   */
  title!: string;

  /**
   * Whether the task is finished
   */
  done!: boolean;

  /**
   * Optional fields use `?`
   * @maxLength 1000
   */
  notes?: string;

  /**
   * Who can do what on this task
   * @param context - the caller context
   * @param action - "create", "get", "update", "delete" or an operation name
   * @returns true, or the reason of the refusal
   */
  async canAct(_context: IOperationContext, _action: string): Promise<boolean | string> {
    // Open to everyone while you get started: restrict it before going to production
    return true;
  }
}
```

The file name must end with `.model.ts`: the build fails on a model file without that suffix.

Build the application after changing a model: it regenerates `webda.module.json` and the `.webda/` folder.

```shell
npm run build
```

## Permissions are required

Permissions are deny-by-default: a model without a `canAct` method is refused on every transport (REST, GraphQL, gRPC,
MCP). `canAct` returns `true` to allow the action, or `false` or a string explaining the refusal.

A rule that only depends on the caller can be written as a static method instead:

```typescript
export class Task extends UuidModel {
  static canAct(context: IOperationContext, action: string): boolean | string {
    if (action === "get") {
      return true;
    }
    return context.getCurrentUserId() ? true : "Login required";
  }
}
```

The [Post model of the blog tutorial](./Tutorial-BlogSystem/03-Post-Model.md) shows a complete rule, with drafts only
visible to their author.

## Use it in code

Read and write data through the model; never through a store:

```typescript
const task = await Task.create({ title: "Write the docs", done: false });
const same = await Task.ref(task.getUUID()).get();
const { results } = await Task.query("done = FALSE ORDER BY title LIMIT 20");
const mine = await Task.query("title = ?", ["Write the docs"]);
```

Queries use [WebdaQL](../Concepts/Stores/WebdaQL.md). The model is stored in the application's default store, chosen
with `--store` when the application was created.

## Use it from a client

Webda exposes the create, get, update, patch, delete and query operations of every model on each configured
transport. With the REST transport, after `npm run debug`:

```shell
# Create
curl -X POST http://localhost:18080/tasks -H "Content-Type: application/json" \
  -d '{"title": "Write the docs", "done": false}'
# Get, update, patch, delete
curl http://localhost:18080/tasks/<uuid>
curl -X PUT http://localhost:18080/tasks/<uuid> -H "Content-Type: application/json" \
  -d '{"title": "Write the docs", "done": true}'
curl -X PATCH http://localhost:18080/tasks/<uuid> -H "Content-Type: application/json" -d '{"done": true}'
curl -X DELETE http://localhost:18080/tasks/<uuid>
# Query
curl -X PUT http://localhost:18080/tasks -H "Content-Type: application/json" -d '{"q": "done = FALSE"}'
```

## Add a custom operation

A method decorated with `@Operation()` becomes an operation of the model, called on the instance loaded from its key.
It goes through `canAct` with the method name as action.

```typescript
import { Operation } from "@webda/core";

export class Task extends UuidModel {
  // ...

  /**
   * Operation id: Task.Complete; REST: PUT /tasks/{uuid}/complete
   */
  @Operation()
  async complete(): Promise<void> {
    this.done = true;
    await this.save();
  }
}
```

## Relations

A field typed with a relation links models together:

```typescript title="src/models/Project.model.ts"
import { OneToMany, UuidModel } from "@webda/models";
import type { Task } from "./Task.model.js";

export class Project extends UuidModel {
  name!: string;
  tasks!: OneToMany<Task, Project, "project">;
}
```

```typescript title="src/models/Task.model.ts"
import { BelongTo, UuidModel } from "@webda/models";
import type { Project } from "./Project.model.js";

export class Task extends UuidModel {
  // ...
  project!: BelongTo<Project>;
}
```

| Type                                       | Meaning                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `BelongTo<Parent>`                         | this model belongs to a parent; deleting the parent does not delete it |
| `RelateTo<Other>`                          | a link to another model, no cascade                                    |
| `OneToMany<Child, ThisModel, "attribute">` | the children whose `attribute` points to this model                    |
| `ManyToMany<Other>`                        | many-to-many links                                                     |

A `BelongTo` or `RelateTo` field stores the key of the target: `Task.create({ title, done: false, project:
project.getUUID() })`. Import related models with `import type` to avoid circular imports. See
[Relations](../Concepts/Models/Relations.md).

## Your own primary key

Extend `Model` and declare the key fields:

```typescript
import { Model, WEBDA_PRIMARY_KEY } from "@webda/models";

export class Category extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;

  /**
   * @pattern ^[a-z0-9-]+$
   */
  slug!: string;

  name!: string;
}
```

## Common mistakes

- `@Model()` / `@Expose()` decorators and `CoreModel` are Webda v3 APIs: extend `Model` or `UuidModel`, no decorators.
- Injecting a store (`@Inject("taskStore")`): use `Task.create`, `Task.ref(uuid).get()`, `Task.query(...)`.
- Editing `webda.module.json` or `.webda/`: they are generated, change the model and run `npm run build`.

Next: [My First Service](./FirstService.md).
