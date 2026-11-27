# Run your application

Choose how to start your application, then configure and observe the running process.
Compile it first with `webdac build`; the runtime launcher is `webda`.

| Mode                 | Command                                  | Use it for                                               |
| -------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Development          | `webda debug`                            | Running with interactive inspection and debug tooling    |
| HTTP server          | `webda serve`                            | Serving the application's configured HTTP interfaces     |
| Selected deployment  | `webda -d production serve`              | Applying a named deployment's configuration at startup   |
| Packaged application | `webda serve` from the package directory | Running configuration and modules prepared at build time |

## Local development

Start with [Quick Start](../QuickStart/QuickStart.mdx). Generated projects provide scripts to build and run the
application. Use the [debug guide](../Debug/index.md) when you need request inspection or breakpoints.

## Runtime configuration

Configure services in [webda.config.json](../Concepts/Webda.config.json.md). For a named deployment or a
self-contained package, follow [deployment configuration and packaging](../Deployments/Deployments.md).
A packaged application already contains its selected deployment; start it without applying that deployment again.

The [runtime CLI reference](../Modules/core/CLI.md) describes server options and service filtering.
For container and cloud environments, continue to [Deploy](../Deployments/Deployments.md).

## Observe a running application

Use [Monitoring](../Monitoring/Monitoring.md) to understand the available metrics and
[Prometheus](../Monitoring/Prometheus.md) to collect them. Use [benchmarks](../Benchmarks.md) for controlled
performance comparisons rather than treating production traffic as a repeatable test.
