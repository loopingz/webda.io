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

Its imports keep pointing to the source tree, so this file is meant for inspection, not for running a package.
