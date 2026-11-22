# Debug in VSCode

Launch in your "Javascript Debugger Console".

For unit tests, you have to specify something:

```
{
  // Use IntelliSense to learn about possible attributes.
  // Hover to view descriptions of existing attributes.
  // For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Webda Test",
      "skipFiles": ["<node_internals>/**"],
      "program": "node_modules/vitest/vitest.mjs",
      "cwd": "${workspaceFolder}/packages/core",
      "args": ["run", "src/services/domainservice.spec.ts", "-t", "DomainServiceTest"],
      "sourceMaps": true,
      "smartStep": true,
      "console": "integratedTerminal",
      "autoAttachChildProcesses": true
    }
  ]
}
```
