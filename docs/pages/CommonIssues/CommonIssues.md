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

### `@webda/... loaded twice`

Webda needs a single instance of each `@webda/*` package: repositories are keyed by model class and WebdaQL
expressions are matched with `instanceof`, so a second copy breaks later with misleading errors
(`No repository found for ...`, `column "..." does not exist`).

Each `@webda/*` package registers itself when it is loaded, and the import fails when the same package is
loaded from a second path, even with the same version:

```
Error: @webda/ql loaded twice: /app/node_modules/.pnpm/@webda+ql@4.0.0/node_modules/@webda/ql/lib/index.js (4.0.0) and
/app/node_modules/.pnpm/@webda+models@4.0.0_.../node_modules/@webda/ql/lib/index.js (4.0.0).
Webda needs a single instance of each package: dedupe your install (pnpm: a missing direct dependency or an override on a peer)
```

To fix it, dedupe your install. With pnpm, overrides do not apply to peer dependencies: a `@webda/*` package
required as a peer (for example `@webda/ql` and `@webda/utils` by `@webda/models`) is auto-installed for every
package that does not list it. Declare it as a direct dependency, then check with `pnpm why @webda/ql`.

As a temporary workaround, `WEBDA_ALLOW_DUPLICATE_PACKAGES=1` logs the error instead of failing.
