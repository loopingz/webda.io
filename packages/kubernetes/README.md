# @webda/kubernetes module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

> Kubernetes integration for Webda — `KubeRunner` dispatches async jobs as Kubernetes batch Jobs, `KubernetesSecretsStore` reads model data from K8s Secrets, and `CronJobDeployer` manages CronJob lifecycle.

## When to use it

- You are using `@webda/async` and want async job workers to run as Kubernetes Jobs (one pod per job, auto-retried, auto-cleaned).
- You want to store Webda model instances in Kubernetes Secrets (useful for small, sensitive configuration objects).
- You need to deploy a scheduled Webda service operation as a Kubernetes CronJob.
- You read Kubernetes resources from a service: typed API clients and a self-restarting informer for custom resources.
- You store configuration-like models as Kubernetes custom resources (`KubernetesStore`), editable with kubectl/GitOps.
- You reconcile those models like a Kubernetes controller (`KubernetesOperator`).

## Install

```bash
pnpm add @webda/kubernetes
```

## Configuration

### KubeRunner (async job runner)

```json
{
  "services": {
    "kubeRunner": {
      "type": "KubeRunner",
      "jobImage": "my-registry/my-webda-app:latest",
      "context": "my-k8s-context"
    },
    "asyncJobService": {
      "type": "AsyncJobService",
      "queue": "AsyncActionsQueue",
      "runners": ["kubeRunner"]
    }
  }
}
```

| Parameter | Type | Default | Required | Description |
|---|---|---|---|---|
| `jobImage` | string | — | Yes* | Docker image to use for the Kubernetes Job pod (`*` or `jobResources`) |
| `jobResources` | object \| string | — | Yes* | Full Kubernetes Job manifest (object or path to YAML file) overriding the default template |
| `config` | string \| object | — | No | Kubernetes config path or inline `K8sConfiguration` (defaults to in-cluster config) |
| `context` | string | — | No | Kubernetes context name (from kubeconfig) to use |

## Usage

```typescript
// Workers are dispatched automatically by AsyncJobService.
// KubeRunner translates each AsyncAction into a Kubernetes Job:
//
// 1. AsyncJobService.launchAsAsyncAction("MyService", "runReport", reportId)
//    → saves AsyncAction to store → sends to queue
//
// 2. KubeRunner picks up the queue message and creates a Kubernetes Job:
//    kubectl get jobs
//    NAME                          COMPLETIONS   DURATION
//    kuberunner-abc123             1/1           12s
//
// 3. The Job pod runs: webda runAsyncAction
//    → calls MyService.runReport(reportId) inside the cluster

// To run locally (without Kubernetes), switch to ServiceRunner:
{
  "services": {
    "asyncJobService": {
      "runners": ["serviceRunner"]   // swap in for dev
    }
  }
}
```

### KubernetesStore (models as custom resources)

```json
{
  "services": {
    "tenantStore": {
      "type": "Webda/KubernetesStore",
      "group": "myapp.example.com",
      "namespace": "tenants",
      "models": ["MyApp/Tenant"],
      "labelFields": { "MyApp/Tenant": ["plan"] },
      "statusFields": { "MyApp/Tenant": ["ready"] }
    }
  }
}
```

Each model of `models` is a CustomResourceDefinition `<plural>.<group>`; its subclasses share its resources. The primary
key is the resource name (a lowercase DNS subdomain: a composite key needs `-` or `.` as `PrimaryKeySeparator`), the
stored fields its `spec`, the `statusFields` its `status`. Writes are optimistic (`resourceVersion`, retried on
conflict); `=` and `IN` on `labelFields` are filtered by the API server, the rest of a query in memory.

`webda kubernetes crd export --target ./crds` writes the definitions to apply, or set `installCrds: true` to create
them at init (needs the rights on `customresourcedefinitions`). `webda kubernetes rbac export --target ./rbac.yaml`
writes the Roles, ClusterRole and bindings the stores and operators need.

| Parameter | Default | Description |
|---|---|---|
| `group` | — (required) | API group of the custom resources |
| `version` | `v1` | API version |
| `namespace` | `default` | Namespace of the resources (ignored for `Cluster` scope) |
| `scope` | `Namespaced` | `Namespaced` or `Cluster` |
| `labelFields` | `{}` | Fields mirrored as labels, by model |
| `statusFields` | `{}` | Fields written through the status subresource, by model |
| `installCrds` | `false` | Create or update the definitions at init |
| `maxRetries` | `5` | Attempts of a read-modify-write on conflicts |
| `config`, `context`, `timeout` | in-cluster / kubeconfig, 10000 ms | Kubernetes client |

Kubernetes is not a database: use it for configuration-like models (tens to thousands of objects, at most ~1.5 MiB
each). A label field must hold label-compatible values; resources created with kubectl need the labels too to be found
by a query on them.

### KubernetesOperator (reconcile models)

```typescript
class Tenant extends UuidModel implements Reconcilable {
  name!: string;
  ready?: boolean;

  async reconcile() {
    // provision a database, a namespace...
    await this.patch({ ready: true });
    // optional: reconcile again later
    return { requeueAfter: 60_000 };
  }

  async finalize() {
    // clean up before the object is deleted (needs `finalizer`)
  }
}
```

```json
{
  "services": {
    "tenantOperator": {
      "type": "Webda/KubernetesOperator",
      "models": ["MyApp/Tenant"],
      "finalizer": "myapp.example.com/finalizer"
    }
  }
}
```

`webda kubernetes operator` runs it (or `autoStart: true` at init). The models must be stored in a `KubernetesStore`; the
CRD of a model with a `reconcile` method gets a status subresource with `observedGeneration` and `conditions`.

- `reconcile()` is called when the spec changes (`metadata.generation`), on resync (`resyncPeriod`, 5 min) and again
  after a failure (exponential backoff up to `maxBackoff`). Status-only changes, its own included, are not reconciled.
- The status gets `observedGeneration` and a `Ready` condition (`Reconciled`, or `ReconcileError` with the message).
- With `finalizer`, it is added to the objects and `finalize()` runs before the API server deletes them.
- With `leaderElection` (default), only the replica holding the `coordination.k8s.io` Lease reconciles: the service
  account needs `get`, `create` and `update` on `leases`, and `get`, `list`, `watch`, `update` on the resources and
  their status.
- Metrics: `reconcile_total{model,result}`, `reconcile_duration_seconds{model}`, `queue_depth{model}`.

### API clients and informer

```typescript
import * as k8s from "@kubernetes/client-node";
import { getKubernetesApiClient, KubernetesInformer } from "@webda/kubernetes";

// In-cluster service account, else the local kubeconfig; each request aborts after 4s
const core = getKubernetesApiClient({ timeout: 4000 }, k8s.CoreV1Api);
await core.listNamespacedPod({ namespace: "default" });

// List then watch custom resources, restarting with a backoff after any error
const projects = new KubernetesInformer({ timeout: 4000 }, { group: "example.com", version: "v1", plural: "projects" });
projects.on("change", project => console.log("changed", project.metadata?.name));
projects.on("error", err => console.error("informer restarts", err));
await projects.start(); // resolves after the first list, check projects.synced
projects.list();
```

The informer needs the `list` and `watch` verbs on the resource.

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/kubernetes/`.
- Source: [`packages/kubernetes`](https://github.com/loopingz/webda.io/tree/main/packages/kubernetes)
- Related: [`@webda/async`](../async) for the job orchestration layer; [`@webda/aws`](../aws) for `LambdaDeployer` as an AWS equivalent; [`@webda/core`](../core) for the `Runner` base class.

<!-- README_FOOTER -->

## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://webda.io/img/sponsors/arize.svg" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://webda.io/img/sponsors/loopingz.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://webda.io/img/sponsors/tellae.svg" width="200">](https://tellae.fr)
