# Debug your application

Choose the tool that matches the problem you are investigating.

| Tool             | Use it to                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Terminal UI      | Inspect a development application from `webda debug`                                             |
| Web dashboard    | Explore models, services, operations, configuration, logs, and requests with `webda debug --web` |
| VS Code debugger | Set breakpoints and inspect execution inside your code                                           |

## Inspect the running application

The [debug dashboard guide](./DebugDashboard.md) covers terminal and browser tooling, hosted versus local dashboards,
and how the dashboard connects to the debug server.

## Step through code

Follow [Debug in VS Code](./DebugInVSCode.md) to attach a debugger and inspect variables and call stacks.

## Investigate a failing test

The [application test harness](../Modules/test/README.md) captures logs for failed tests under `.webda/tests/`.
Reproduce the failure with a focused test, then use those logs or a debugger to trace it.
For long-running service health, see [Monitoring](../Monitoring/Monitoring.md).
