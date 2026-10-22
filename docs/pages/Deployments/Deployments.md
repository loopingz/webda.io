---
sidebar_position: 3
---

# Deployments

Webda allow you to deploy your code in many differents way

## Package a deployment

A deployment is applied at runtime with `webda -d <deployment> serve`: the application reads
`webda.config.jsonc` and `deployments/<deployment>.json`, then scans its modules.

`webda -d <deployment> package` applies the deployment once, at build time, and writes a self-contained folder:

```bash
webda -d production package              # writes dist/webda
webda -d production package -o build/app # any empty folder
```

The folder contains the application files, its production `node_modules`, the deployed `webda.config.json`
and the `.webda/packaged.json` marker. Run it with `webda serve`, without `-d`: no deployment files are
needed and the modules are not scanned at startup. The deployment units (deployers) are not part of the
package. The command never overwrites a non-empty folder.

To only get the deployed configuration, for example to review or diff it in CI:

```bash
webda -d production package --config-only > production.json
webda -d production package --config-only -o production.json
```

The file is the deployed configuration with its modules cached and the `$packaged` marker, the content of
`.webda/packaged.json` (deployment, package name and version, git information):

```json title="production.json"
{
  "$packaged": {
    "deployment": "production",
    "package": { "name": "my-app", "version": "1.2.3" },
    "git": { "commit": "4f2a...", "version": "1.2.3" }
  },
  "version": 4,
  "parameters": { "apiUrl": "https://api.example.com" },
  "cachedModules": { "...": "..." }
}
```

Its imports stay relative to the application folder, pointing to the `node_modules` it was generated in. Written as
the `webda.config.json` of an application that keeps this layout, `webda serve` (without `-d`) runs it as packaged:
no deployment files, no modules scan, the git information baked at build time. This is how a
[Bazel](./Bazel.md) build runs a Webda application. The startup logs show it:

```
INFO Loading the packaged configuration /app/webda.config.json ($packaged)
```

The configuration file is chosen like any `webda.config` file, the first of `.yaml`, `.yml`, `.jsonc` and `.json`:
a `webda.config.jsonc` next to it takes precedence and the application loads unpacked, with a warning. Without the
marker, the file would be loaded as a source configuration: the defaults and the `$import` would be applied again,
and the git information would be empty.

`--config-only -o` refuses to overwrite the configuration file of the application (a source `webda.config.json`),
which would also switch it to packaged mode: write it to another file, or add `--force`.
