# Debug in VSCode

Launch in your "Javascript Debugger Console".

For unit tests, you have to specify something:

```
```


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
      "runtimeArgs": ["--nolazy"],
      "program": "node_modules/.bin/mocha",
      "cwd": "${workspaceFolder}/packages/core",
      "args": [
        "--exit",
        "--timeout=30000",
        "-r",
        "../../node_modules/ts-node/register",
        "src/**/*.spec.ts",
        "src/*.spec.ts",
        "src/**/**/*.spec.ts",
        "-g",
        "DomainServiceTest"
      ],
      "sourceMaps": true,
      "smartStep": true,
      "console": "integratedTerminal",
      "autoAttachChildProcesses": true,
      "outFiles": [
        "/datas/git/webda.io/packages/**/lib/**/*.js",
        "/datas/git/webda.io/packages/**/lib/*.js"
      ]
    }
  ]
}
```