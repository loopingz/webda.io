---
sidebar_position: 1
sidebar_label: "01 — Setup"
---

# 01 — Project Setup

**Goal:** Create an empty Webda v4 project with `npm create @webda`, understand its layout, and check that it builds and starts.

**Files touched:** `package.json`, `webda.config.json` (generated, then trimmed).

**Concepts:** project layout, `webdac build` and its generated files, `$schema` for IDE autocomplete.

## Walkthrough

### 1. Create the project

```bash
npm create @webda my-blog -- --store memory --transports rest --yes
cd my-blog
```

`@webda/create` writes the project, installs the dependencies and initializes a git repository. The options after `--` are passed to the generator:

| Option         | Values                                         | Default                      |
| -------------- | ---------------------------------------------- | ---------------------------- |
| `--store`      | `memory`, `file`, `mongodb`, `postgres`        | `memory`                     |
| `--transports` | comma list of `rest`, `graphql`, `grpc`, `mcp` | `rest`                       |
| `--namespace`  | application namespace (PascalCase)             | from the directory: `MyBlog` |
| `--yes`, `-y`  | accept the defaults, never prompt              |                              |

We start with REST only and add GraphQL and gRPC on pages 09 and 10 to see what each one needs. (`--transports rest,graphql,grpc` would set them up right away.)

### 2. Look around

```
my-blog/
├── package.json        # scripts and the "webda.namespace"
├── tsconfig.json
├── webda.config.json   # services and parameters
├── src/
│   ├── models/         # *.model.ts — domain models
│   └── services/       # *.service.ts — services
├── test/               # vitest tests
├── AGENTS.md, CLAUDE.md, .agents/skills/   # guidance for coding agents
```

The generated `package.json` contains:

```json title="package.json (excerpt)"
{
  "type": "module",
  "scripts": {
    "build": "webdac build",
    "predebug": "webdac build",
    "debug": "webda debug",
    "preserve": "webdac build",
    "serve": "webda serve",
    "pretest": "webdac build",
    "test": "vitest run"
  },
  "webda": {
    "namespace": "MyBlog"
  }
}
```

- `"type": "module"` — Webda is ESM only. Relative imports carry their `.js` extension (`./User.model.js`).
- `webda.namespace` — your models and services are registered as `MyBlog/<Name>`.
- `webdac` (from `@webda/compiler`) builds the project; `webda` (from `@webda/core`) runs it. `debug`, `serve` and `test` build first.

### 3. Remove the example code

The generator ships an example `Project`/`Task` domain. The blog does not need it:

```bash
rm src/models/Project.model.ts src/models/Task.model.ts src/services/task.service.ts
```

Remove the `TaskService` entry from `webda.config.json`, and the `summarizesTheTasksOfAProject` test from `test/app.spec.ts`. The configuration is now:

```json title="webda.config.json"
{
  "$schema": ".webda/config.schema.json",
  "version": 4,
  "parameters": {},
  "services": {
    "HttpServer": {
      "type": "Webda/HttpServer"
    },
    "DomainService": {
      "type": "Webda/DomainService"
    },
    "RESTService": {
      "type": "Webda/RESTOperationsTransport"
    }
  }
}
```

- `HttpServer` — listens on port `18080`. Add `"autoTls": true` to serve HTTPS (and HTTP/2) with a self-signed certificate, as the sample app does; this tutorial keeps plain HTTP.
- `DomainService` — registers the operations of every model: create, get, update, patch, delete, query and the model's own `@Operation` methods.
- `RESTService` — exposes the registered operations as REST routes.

No store is configured: models are saved in the default `Registry` store, an in-memory store persisted to `.registry`. Page 11 shows how to switch to a database.

### 4. Build

```bash
npm run build
```

`webdac build` compiles `src/` to `lib/` and generates:

| File                        | Description                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| `webda.module.json`         | Every model, service and bean the compiler found — loaded at runtime |
| `.webda/config.schema.json` | JSON Schema of `webda.config.json` — powers IDE autocomplete         |
| `.webda/operations.json`    | Every operation id with its input and output schemas                 |
| `.webda/module.d.ts`        | Types of your models, included by `tsconfig.json`                    |

:::note Generated files
Never edit `webda.module.json`, `lib/` or anything inside `.webda/` by hand. They are regenerated on every build.
:::

### 5. Start the server

```bash
npm run debug
```

`webda debug` starts the application on `http://localhost:18080` with an interactive debug console. Use `npm run serve` for a plain server without the terminal UI (in CI, scripts or a coding agent). Leave the server running in a second terminal, and restart it after each change in the following pages: both scripts rebuild before starting.

## Verify

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:18080/no-such-route
```

```
404
```

The server answers. It has no model yet, so there is nothing else to call.

## What's next

→ [02 — User Model](./02-User-Model.md)
