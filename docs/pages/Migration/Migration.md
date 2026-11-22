# Migration

`webdac code` (from `@webda/compiler`) migrates the application sources to the current Webda version: it moves
imports to the packages that now own them and drops registrations the framework now does for you. It edits the files
listed by your `tsconfig.json` in place, so commit first.

```bash
webdac code                            # run every migration module
webdac code --module updateImports     # run only one module
```

See [`webdac code`](../Modules/compiler/CodeGen.md) for the migration modules.

The v3 to v4 guides cover the changes `webdac code` does not rewrite:

- [Stores](./Stores-v3-to-v4.md)
- [Authentication](./Authentication-v3-to-v4.md)
- [Cron](./Cron-v3-to-v4.md)
