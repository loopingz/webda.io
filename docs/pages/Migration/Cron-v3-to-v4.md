# Cron: v3 to v4

In Webda 4, `@Cron` only schedules operations. Each tick calls the operation as the system, through
`callOperation`, on the cluster leader only. See [the `@Cron` decorator](../Modules/core/Services.md) for the
complete reference.

## Make the method an operation

`@Cron` on a method without `@Operation` is a startup error (`@Cron on <Service>.<method> requires @Operation`).
Add `@Operation()`, above or below `@Cron`. Set `graphql: false, grpc: false, mcp: false` or `hidden: true` if the
operation should not be exposed on a transport.

## Pass a named input

The positional arguments after the description become one input object, validated against the operation input
schema at startup:

```typescript
// Webda 3
@Cron("0 3 * * *", "Nightly reconciliation", true, "eu")
async reconcile(full: boolean, region: string) {}

// Webda 4
@Operation()
@Cron("0 3 * * *", "Nightly reconciliation", { full: true, region: "eu" })
async reconcile(full: boolean, region: string) {}
```

A third argument that is not a plain object is an error.

## Other changes

- `CronDefinition.args` is gone: a cron has `operationId` and `input`. `toString()` prints
  `<cron>: <operationId>(<json input>) # <description>`.
- `CronService.loadAnnotations(services)` is deprecated: use `CronService.resolveCrons(services?)`, which also returns
  the crons registered with `CronService.register(operationId, { cron, description, input })`.
- The exported cron ids change (they hash the operation and its input instead of the method and its arguments):
  export the Kubernetes CronJobs and the Azure jobs again.
- The Kubernetes templates lose `cron.args`, `cron.argsLine`, `cron.argsLineSingleQuote`, `cron.argsArray` and
  `${...cron.args}`; they gain `cron.operationId`, `cron.operationName`, `cron.inputJson` and `cron.inputb64`. The
  default CronJob and file names use the operation id.
- `webda cron` and the async scheduler run the ticks on the cluster leader only. Configure a cluster service
  (`Webda/StoreClusterService` or `Webda/KubernetesClusterService`) when the application has several replicas; a
  single instance is always the leader.
- A tick runs as the system: `useContext().getCurrentUserId()` is `"system"` inside the operation. The input is
  validated and the operation authorizers run; the `permission` query and `maxMfaAge` let the system through.
