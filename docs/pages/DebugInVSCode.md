# Debug in VSCode

Seems we need to add the outFiles as absolute path

```
{
    // Use IntelliSense to learn about possible attributes.
    // Hover to view descriptions of existing attributes.
    // For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
    version: "0.2.0",
    configurations: [
    {
        type: "pwa-node",
        request: "launch",
        name: `Debug ${"projectName"} Webda API`, // Add project-name
        skipFiles: ["<node_internals>/**"],
        runtimeArgs: ["--nolazy"],
        program: "node_modules/.bin/webda",
        args: ["--notty", "--noCompile", "--logLevel", "TRACE", "serve", "--devMode"],
        sourceMaps: true,
        smartStep: true,
        console: "integratedTerminal",
        autoAttachChildProcesses: true,
        outFiles: [
            "${absPath}/lib/**/*.js", // Replace by abspath
            "${absPath}/lib/*.js",
            "/datas/git/webda.io/packages/**/lib/**/*.js",
            "/datas/git/webda.io/packages/**/lib/*.js"
        ]
    }
    ]
}
```