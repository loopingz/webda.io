---
sidebar_position: 1
---

# Quick Start

Webda requires Node.js 22 or later.

## Create the application

```shell
npm create @webda my-app
cd my-app
```

The command asks for the store and the transports, then installs the dependencies and initializes a git repository.
To skip the questions, pass the options directly:

```shell
npm create @webda my-app -- --store postgres --transports rest,graphql --yes
```

| Option                     | Values                                         | Default                                 |
| -------------------------- | ---------------------------------------------- | --------------------------------------- |
| `--store`                  | `memory`, `file`, `mongodb`, `postgres`        | `memory`                                |
| `--transports`             | comma list of `rest`, `graphql`, `grpc`, `mcp` | `rest`                                  |
| `--namespace`              | application namespace                          | from the directory name                 |
| `--pm`                     | `pnpm`, `npm`, `yarn`                          | the package manager running the command |
| `--no-install`, `--no-git` | skip install / git init                        |                                         |
| `--yes`, `-y`              | accept defaults, never prompt                  |                                         |

## What you get

```text
my-app/
├── src/
│   ├── models/
│   │   ├── Project.model.ts
│   │   └── Task.model.ts
│   └── services/
│       └── task.service.ts
├── test/
│   └── app.spec.ts
├── webda.config.json
├── package.json
├── AGENTS.md / CLAUDE.md    # guidance for coding agents
└── .agents/skills/          # skills for coding agents
```

- **Models** (`src/models/*.model.ts`) define your data, its validation and its permissions. Webda exposes them through
  every configured transport: see [My First Model](./FirstModel.md).
- **Services** (`src/services/*.service.ts`) hold behaviour that is not about a single model: see
  [My First Service](./FirstService.md).
- **`webda.config.json`** enables the services and sets their parameters.

## Run it

```shell
npm run debug   # build, then dev server with the interactive debug console on http://localhost:18080
npm run serve   # build, then HTTP server on http://localhost:18080
npm run build   # compile and generate webda.module.json
npm test        # build, then run the tests
```

The CLI comes from two packages: `webda` (from `@webda/core`) runs the application, `webdac` (from `@webda/compiler`)
builds it.

`npm run build` compiles TypeScript and generates the application metadata: `webda.module.json` and the `.webda/`
folder (JSON schemas, operations). Do not edit these files: change the code and build again.

## Configuration auto-completion

The build writes the JSON schema of your configuration to `.webda/config.schema.json`, and the generated
`webda.config.json` references it:

```json
{
  "$schema": ".webda/config.schema.json",
  "version": 4,
  "services": {
    "HttpServer": { "type": "Webda/HttpServer" },
    "DomainService": { "type": "Webda/DomainService" },
    "RESTService": { "type": "Webda/RESTOperationsTransport" }
  }
}
```

Editors such as VS Code then complete and validate service types and their parameters.

## Working with a coding agent

The generated application includes `AGENTS.md`, `CLAUDE.md` and skills in `.agents/skills/` describing the Webda
patterns. In an existing v4 project, Claude Code users can install the same skills:

```text
/plugin marketplace add loopingz/webda.io
/plugin install webda@webda
```

## Next steps

- [My First Model](./FirstModel.md)
- [My First Service](./FirstService.md)
- [Blog System Tutorial](./Tutorial-BlogSystem/00-Overview.md): a complete application with relations,
  permissions, REST, GraphQL and gRPC
