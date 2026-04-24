---
sidebar_label: "@webda/compiler"
---
# compiler
**@webda/compiler**

***

# @webda/compiler

This package is used to compile a webda module and generate the corresponding code along with the `webda.module.json` file.

## Code

The `code` command ensure your Webda objects have some methods defined and auto-generate the missing ones.

For `Service`:

- ensure the `loadParameters` method is defined and load the defined parameters

For `Model`:

- ensure the `unserialize` method is defined and load the object correctly

## Build hooks

Any service method decorated with `@BuildCommand({...})` contributes to the build pipeline. After TypeScript compilation, `webdac build` detects configured services declaring a `build` command and invokes `webda build`, which:

1. Loads `Application` and `Core`.
2. Runs `Core.resolve()` — services are constructed and resolved, but `init()` is skipped (no DB/network connections are made).
3. Invokes every matching service's `build` method.

Example:

```typescript
@BuildCommand({ description: "Generate proto from operations", requires: ["rest-domain"] })
async build() {
  writeFileSync(this.parameters.protoFile, generateProto(...));
}
```

`@webda/grpc` uses this mechanism to generate `.webda/app.proto` automatically during `webdac build`.
Previously this required a separate `webda generate-proto` step; that command has been removed.
Running `webdac build` is now sufficient.
