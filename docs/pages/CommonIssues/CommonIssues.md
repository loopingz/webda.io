# Common Issues

`ERROR NoRootTypeError: No root type "UnpackedConfiguration" found` when running `webda build`

You need to enforce a version of typescript common for `@webda/shell` and `ts-json-schema-generator`

You can in your package.json

```
"resolutions": {
    "typescript": "^4.7.4"
}
```

### Machine Id

If no registry is defined the machineId is read from different method that can fail in your environment (for example distroless images)

You can use the env variable `WEBDA_MACHINE_ID` to avoid any call to subsystem.

## pnpm

pnpm can create easily several duplicated webda package, you need to be careful to ensure each module is only present once. The use of `"overrides"` within the package.json is helpful.