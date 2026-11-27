---
sidebar_label: VS Code breakpoints
---

# Debug with VS Code

Use VS Code to pause inside a model action or service method, inspect its arguments, and step through the code.
Use the [Webda debug dashboard](./DebugDashboard.md) when you want to inspect requests, configuration, and services
without stopping execution.

## Prepare the application

Open your **application directory** in VS Code—the folder containing its `package.json` and `webda.config.*`.
Install its dependencies and run its build script:

```shell
npm run build
```

The generated Webda project compiles `src/` into `lib/` and enables `compilerOptions.sourceMap` in `tsconfig.json`.
Check that the build produces `.js` and `.js.map` files in `lib/`. If your project uses a different output directory,
adjust the launch configuration below.

## Start the server under the debugger

Save this as `.vscode/launch.json` in your application:

```json title=".vscode/launch.json"
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Webda: serve",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/@webda/core/lib/bin/cli.js",
      "args": ["serve"],
      "cwd": "${workspaceFolder}",
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/lib/**/*.js"],
      "skipFiles": ["<node_internals>/**"],
      "console": "integratedTerminal"
    }
  ]
}
```

This launches the local CLI entry point directly. The public `webda` launcher spawns a child process;
launching `cli.js` makes the application process the debugger's target.

1. Set a breakpoint on an executable line inside a model action or service method in `src/`.
2. Select **Webda: serve** in **Run and Debug**, then press **F5**.
3. Call the endpoint or operation that invokes that method, using your application UI, an HTTP client, or the
   [remote CLI](../Expose/CLI.md#remote-client-cli).
4. When execution pauses, inspect **Variables**, **Watch**, and **Call Stack**. Step through the method, then continue.

Rebuild and restart the debug session after editing TypeScript. To debug startup code, place the breakpoint before
pressing F5. To apply a named deployment, change `args` to `["-d", "development", "serve"]` and use an existing deployment name.

## Debug a test or an existing script

For scripts that launch child processes, open the Command Palette and choose **Debug: Create JavaScript Debug Terminal**.
Run your project's command there after setting a breakpoint. For a project using Vitest, for example:

```shell
pnpm exec vitest run src/services/myservice.spec.ts -t "creates a record"
```

Replace the file and test name with an actual test in your application. Use the project's configured test runner
and build prerequisites; the example is not a command for every Webda application.
For application setup and failure logs, see [Test your application](../Testing.md).

## If the breakpoint does not stop execution

| Symptom                                       | Check                                                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Hollow or unbound breakpoint                  | Rebuild, verify `.js.map` files exist, and match `outFiles` to your emitted JavaScript directory.          |
| Old code executes                             | Stop the session, rebuild, and launch again. This configuration does not watch source changes.             |
| Server starts but the breakpoint is never hit | Invoke the exact action or route containing it; a breakpoint in an unused method will not fire.            |
| Configuration or module cannot be found       | Check `cwd`. In a monorepo, set it to the application folder and adjust `program` and `outFiles` to match. |
| Address already in use                        | Stop the other application instance or pass a different `--port` in `args`.                                |

See [VS Code's Node.js debugging documentation](https://code.visualstudio.com/docs/nodejs/nodejs-debugging)
for source-map diagnostics and JavaScript Debug Terminal behavior.
