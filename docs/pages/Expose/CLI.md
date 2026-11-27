# CLI

Webda offers two command-line interfaces: a server CLI that runs inside the application,
and a remote client CLI that connects to a deployed server.

| Interface                  | Runs where                                                    | Use it for                                          |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Server CLI: `webda`        | In the application directory, with its code and configuration | Service commands, maintenance, and local operations |
| Remote client: `webda.cli` | On a caller's machine, connected to a server URL              | Discovering and invoking remote operations          |

## Server CLI

The `webda` launcher loads the local application. It can run commands without starting an HTTP server.

### Service commands with `@Command`

Use `@Command` for service commands such as maintenance tasks. The service method's parameters define the command options.
The [CLI reference](../Modules/core/CLI.md#service-commands-command) describes providers, filtering,
inheritance, and command visibility.

### Local operation commands

Registered operations become command groups and subcommands. Run `webda --help` in the application directory
to discover the available commands, then use the command's help to inspect its arguments.

See [model operation commands](../Modules/core/CLI.md#model-operation-commands) for examples.

## Remote client CLI

[`webda.cli`](https://github.com/loopingz/webda.cli) connects to a deployed Webda application and builds commands
from its advertised operations and input schemas. It does not need the server's source code or local configuration.
It calls remote operations; it does not remotely execute server-side `@Command` methods.

Follow the repository's [installation instructions](https://github.com/loopingz/webda.cli#installation),
then configure a server profile. With a binary named `webda.cli`:

```bash
webda.cli setup --name staging --url https://staging.example.com
webda.cli --profile staging explore
```

`explore` opens an interactive operation browser. Direct commands support generated flags, JSON input, and
formatted output for scripts. Use `refresh-operations` to refresh the cached operation schema.

The executable name selects the default profile, so a custom binary name can act as an application-specific CLI.
`--profile` selects a different server explicitly. Authentication supports browser-based OAuth with PKCE and
a device-code flow; the server controls which operations the caller may invoke.

## Compiler CLI

For build-time compilation, use `webdac` from `@webda/compiler`. It compiles the application and generates metadata;
it is separate from both runtime interfaces above.
