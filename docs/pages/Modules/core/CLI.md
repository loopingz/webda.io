---
sidebar_position: 11
sidebar_label: CLI Reference
---

# CLI Reference — `webda`

The `webda` CLI launcher (`packages/core/lib/bin/launcher.js`) starts and manages a Webda application at runtime. It must be run from a directory containing a `webda.config.json` with `@webda/core` installed in `node_modules`.

## Commands overview

```
webda <command> [options]

Commands:
  webda serve      Start the HTTP server
  webda openapi    Export the OpenAPI definition
  webda debug      Start dev server with debug dashboard
  webda build      Generate protobuf definition from operations
  webda post       Post operations    (from blog-system: model-specific operations)
  webda user       User operations
  webda publisher  Publisher operations
  webda testbean   TestBean operations

Options:
  -w, --watch    Watch for changes, recompile and restart
  --service      Filter command to specific service(s), comma-separated
  --help         Show help
```

> **Note**: Model-specific operation commands (like `post`, `user`) are dynamically generated from the models and their `@Operation()` methods registered in the current project.

## `webda serve`

Starts the application HTTP server in production mode.

```bash
webda serve
webda serve --port 8080 --bind 0.0.0.0
webda serve --watch   # restart on file changes (requires @webda/compiler)
```

| Flag | Description |
|------|-------------|
| `--port <n>` | Override the HTTP port |
| `--bind <host>` | Bind address (default: `0.0.0.0`) |
| `-w, --watch` | Watch mode with auto-restart |

## `webda debug`

Starts the application in development mode with the debug dashboard enabled. The debug dashboard provides a web UI for inspecting running services, requests, logs, and metrics.

```bash
webda debug
```

The debug server starts on port 18080 by default (configured in `HttpServer.port`).

## `webda openapi`

Exports the generated OpenAPI 3.0 specification to stdout or a file.

```bash
# Print to stdout
webda openapi

# Write to a file
webda openapi --output ./openapi.json

# Include hidden routes
webda openapi --includeHidden --output ./openapi-full.json
```

| Flag | Description |
|------|-------------|
| `-o, --output <file>` | Write to file instead of stdout |
| `--includeHidden` | Include routes marked as hidden |

## `webda build`

Generates protobuf definitions from model operations (for gRPC transport):

```bash
webda build
```

## Model operation commands

For each model with `@Operation()` methods, the launcher generates a CLI subcommand. For example, in the blog-system:

```bash
webda user login --email alice@example.com --password secret
webda post publish --slug hello-world --destination twitter
webda publisher publishPost --slug hello-world
```

These commands invoke the corresponding `@Operation()` static or instance methods directly from the CLI, without starting the HTTP server.

## Service commands (`@Command`)

`serve`, `debug`, `migrate`... are declared by services with the `@Command` decorator; the method parameters become the command options.

- **Several providers**: every configured service declaring the command runs it (`--service=<type or instance name>` filters). The CLI accepts the union of their options and calls every handler with the same positional values, in the order of the merged options: providers must declare their shared parameters in the same order and with the same type. `webda` logs a warning when they do not.
- **Inheritance**: a subclass inherits the commands of its parent class (an application `Authentication` subclass runs `auth migrate`). A subclass redeclaring the command is a second provider: exclude the parent one with `webda.cli.exclude` (below), or the instance runs both.

## Application command-line (`webda.cli`)

The `webda.cli` section of the application `package.json` configures its command-line:

```jsonc
"webda": {
  "namespace": "Loopingz",
  "cli": {
    "name": "acp-loopingz-runner",           // program name in --help, instead of "webda"
    "defaultCommand": "serve",               // run when the arguments name no command
    "bin": "bin/acp-loopingz-runner.mjs",    // generated executable, default bin/<name>.mjs
    "include": ["serve", "login", "logout"], // only these commands (with their subcommands); absent: all
    "exclude": ["Webda/HttpServer:serve", "migrate", "openapi"]
  }
}
```

| Field | Applies to | Description |
|-------|------------|-------------|
| `name` | generated executable (`runCli`) | Program name shown in `--help`; also names the executable. Defaults to the unscoped package name |
| `defaultCommand` | generated executable (`runCli`) | Command inserted when the arguments name none (`acp-loopingz-runner --port 3000` runs `serve --port 3000`); `--help` and `--version` alone still show the global help and version |
| `bin` | `webdac build` | Path of the generated executable, relative to the package, default `bin/<name>.mjs` |
| `include` | `webda` and the executable | Allow-list of commands, applied before `exclude`; a command keeps its subcommands (`"config"` keeps `config encrypt`) |
| `exclude` | `webda` and the executable | `"Type:command"` removes one provider of a command (`"Webda/HttpServer:serve"`, or `"HttpServer:serve"`), `"command"` removes the command with its subcommands |

`include` and `exclude` apply to `webda` too, so `webda` and the application executable offer the same commands. An entry matching no command logs a warning. An excluded provider is not added to the configuration to run the command either.

Replacing a framework command with a subclass, for example a `serve` taking a hub address:

```typescript
class RunnerHttpServer extends HttpServer {
  @Command("serve", { description: "Start the runner" })
  async serve(bind: string = "127.0.0.1", port: number = 18080, connect: string = "wss://hub.example.com") {
    // ...
  }
}
```

With `"exclude": ["Webda/HttpServer:serve"]`, `acp-loopingz-runner --port 3000 --connect wss://other` runs `RunnerHttpServer.serve("127.0.0.1", 3000, "wss://other")` once.

### Generated executable

When `webda.cli` exists, `webdac build` writes the executable (mode 755, rewritten only when its content changes):

```js
#!/usr/bin/env node
// Generated by webdac build from the "webda.cli" section of package.json: do not edit
import { fileURLToPath } from "node:url";
import { runCli } from "@webda/core/lib/bin/cli.js";
await runCli({ appPath: fileURLToPath(new URL("../", import.meta.url)) });
```

Declare it in the package.json `bin` field so npm installs it (`webdac build` warns when it is missing):

```json
"bin": { "acp-loopingz-runner": "bin/acp-loopingz-runner.mjs" }
```

It runs the application from its package folder, whatever the current directory: relative `ResourceService` folders resolve from the application folder.

### `runCli`

`runCli(options?: { appPath?: string; argv?: string[]; defaultCommand?: string; name?: string }): Promise<void>`, exported by `@webda/core/lib/bin/cli.js`

| Option | Default | Description |
|--------|---------|-------------|
| `appPath` | `WEBDA_APP_PATH`, then `.` | Application folder (`package.json`, `webda.module.json`, `.webda/`) |
| `argv` | `process.argv.slice(2)` | Arguments to parse |
| `defaultCommand` | `webda.cli.defaultCommand` | Command inserted when the arguments name none |
| `name` | `webda.cli.name`, then `webda` | Program name in `--help` |

The process exits when the command completes. Importing the module does not start the CLI.

## Global options

| Flag | Description |
|------|-------------|
| `--version` | Show version number |
| `-w, --watch` | Watch for changes, recompile and restart |
| `--service <names>` | Filter command to specific service(s), comma-separated |
| `--help` | Show help |

## Verify

```bash
# Run from the blog-system project
cd sample-apps/blog-system

node ../../packages/core/lib/bin/launcher.js --help
```

Output:

```
webda <command> [options]

Commands:
  webda serve      Start the HTTP server
  webda openapi    Export the OpenAPI definition
  webda debug      Start dev server with debug dashboard
  webda build      Generate protobuf definition from operations
  webda post       Post operations
  webda user       User operations
  webda publisher  Publisher operations
  webda testbean   TestBean operations

Options:
      --version  Show version number                                   [boolean]
  -w, --watch    Watch for changes, recompile and restart (requires
                 @webda/compiler)                     [boolean] [default: false]
      --service  Filter command to specific service(s), comma-separated [string]
      --help     Show help                                             [boolean]
```

## See also

- [Architecture](./Architecture.md) — what the launcher starts under the hood
- [Services](./Services.md) — services that the launcher initializes
- [Routing](./Routing.md) — how HTTP routes are registered
- [@webda/compiler CLI](../compiler/Build.md) — `webdac build` for TypeScript compilation
