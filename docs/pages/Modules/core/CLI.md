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

- **Several providers**: every configured service declaring the command runs it (`--service=<type or instance name>` filters). The CLI accepts the union of their options; each handler receives only its own parameters, matched by name and in its own order, with its own defaults. A provider does not need to repeat the parameters of the others.
- **Inheritance**: a subclass inherits the commands of its parent class (an application `Authentication` subclass runs `auth migrate`).
- **Override**: redeclaring `@Command` with the same name on a subclass replaces the parent's handler for the subclass instances: the command runs once per instance, through the most-derived declaration, which can add options.

```typescript
class RunnerHttpServer extends HttpServer {
  @Command("serve", { description: "Start the runner" })
  async serve(connect: string = "wss://hub.example.com", bind: string = "127.0.0.1", port: number = 18080) {
    // ...
  }
}
// webda serve --connect wss://other --port 3000 → RunnerHttpServer.serve("wss://other", "127.0.0.1", 3000), once
```

## Embedding the CLI (`runCli`)

An application can ship its own executable running the Webda CLI on its folder, whatever the current directory, with a default command:

```js
#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { runCli } from "@webda/core/lib/bin/cli.js";
await runCli({ appPath: fileURLToPath(new URL("..", import.meta.url)), defaultCommand: "serve" });
```

`runCli(options?: { appPath?: string; argv?: string[]; defaultCommand?: string }): Promise<void>`

| Option | Default | Description |
|--------|---------|-------------|
| `appPath` | `WEBDA_APP_PATH`, then `.` | Application folder (`package.json`, `webda.module.json`, `.webda/`) |
| `argv` | `process.argv.slice(2)` | Arguments to parse |
| `defaultCommand` | none | Command inserted when the arguments name none (`my-app --port 3000` runs `serve --port 3000`); `--help` and `--version` alone still show the global help and version |

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
