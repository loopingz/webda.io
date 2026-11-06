# Kubernetes

You can deploy directly to Kubernetes.

## Crons

The `kubernetes cronExport` command (`Webda/KubernetesCronExporter`) exports every `@Cron` operation, and every cron
registered with `CronService.register`, as a Kubernetes `CronJob`. Each job runs `webda cron run --id <cronId>`,
which calls the cron operation as the system with its input: the input is validated and the operation authorizers
run.

```bash
webda kubernetes cronExport [template] [target] [filenameTemplate] [image]
```

- The default template names the CronJob `<operation id, dots as dashes, lower case>-<cronId>`, and the default
  file name is `<operation id lower case>-<cronId>.yaml`.
- `cronId` is stable: it hashes the cron expression, the operation id, the input and the description. Renaming the
  method of an operation that keeps its id keeps it.
- A custom template can use the cron fields (`cron.cron`, `cron.operationId`, `cron.description`, `cron.input`,
  `cron.cronId`), `cron.operationName` (the operation id with dashes), `cron.inputJson` and `cron.inputb64` (the
  input as JSON, and base64 encoded), `resources.tag` (the image) and `env`.

:::note
The Webda 3 `cron.args`, `cron.argsLine`, `cron.argsLineSingleQuote` and `cron.argsArray` placeholders are gone with
the positional cron arguments: use `cron.inputJson` or `cron.inputb64`.
:::

A CronJob fires once per schedule, so the exported jobs do not need a cluster leader. Inside the application,
`webda cron` and the async scheduler only run the ticks on the [cluster leader](../../Modules/core/Cluster.md).
