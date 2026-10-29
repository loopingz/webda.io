---
sidebar_position: 12
sidebar_label: Cluster and leader election
---

# Cluster and leader election

With several replicas, every instance runs every timer. Work that must run once for the whole application (cron ticks, pollers, cleanups) runs on the leader only, through `whenLeader`.

## whenLeader

```typescript
import { whenLeader } from "@webda/core";

export class MyService extends Service {
  protected timer?: NodeJS.Timeout;

  async init(): Promise<this> {
    await super.init();
    whenLeader(
      () => {
        // This instance became the leader
        this.timer = setInterval(() => this.poll(), 10000);
      },
      () => {
        // It lost the leadership, or is shutting down
        clearInterval(this.timer);
      }
    );
    return this;
  }
}
```

- `whenLeader(fn, deregisteredFn?)` can be called from any service, before or after the election. Registering while already leader runs `fn` at once.
- `fn` runs each time the instance becomes the leader, `deregisteredFn` each time it stops leading, and on `stop()`.
- The two callbacks of a registration never overlap: a `deregisteredFn` waits for a pending `fn`.
- An error in `fn` is logged and does not stop the election.
- `whenLeader` returns a function removing the registration. It calls `deregisteredFn` if `fn` had run.
- `useCluster().isLeader()` tells whether this instance leads, and `useCluster().getInstanceId()` gives its identity.

Without a cluster service, the application is a single instance: `useCluster()` returns a local cluster that is always the leader, so `fn` runs at once. Single-instance applications need no configuration.

## Backends

Configure one cluster service. `useCluster()` returns the first `ClusterService` of the application.

| Service                                       | Lease                                                    | Use it when                                                                |
| --------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `Webda/StoreClusterService`                   | Registry entry `cluster:<leaseName>`, conditional patch  | Any deployment: it works with every store backing the Registry             |
| `Webda/KubernetesClusterService` (kubernetes) | `coordination.k8s.io` Lease `<leaseName>` in `namespace` | On Kubernetes, without a shared store, or to see the leader with `kubectl` |

```json
{
  "services": {
    "cluster": {
      "type": "Webda/StoreClusterService",
      "leaseDuration": 15000,
      "renewInterval": 5000
    }
  }
}
```

## Parameters

| Parameter       | Default                                 | Description                                                   |
| --------------- | --------------------------------------- | ------------------------------------------------------------- |
| `leaseDuration` | `15000`                                 | Milliseconds a lease is valid without renewal                 |
| `renewInterval` | `5000`                                  | Milliseconds between two attempts, lower than `leaseDuration` |
| `instanceId`    | `process.env.HOSTNAME` or a random UUID | Identity of this instance                                     |
| `leaseName`     | `leader`                                | Name of the lease: one election per name                      |

`KubernetesClusterService` also takes `namespace` (default: `POD_NAMESPACE`, else the namespace of the pod's service account, else `default`) and the client parameters `config`, `context` and `timeout`. Its service account needs `get`, `create` and `update` on `leases`.

## Failover

- Every `renewInterval`, each instance tries to acquire the lease, or to renew it when it holds it. Two instances never both win.
- A leader that cannot renew (store or API error, lease taken over) stops leading at once and calls its `deregisteredFn`s, before its lease can expire for the others.
- A leader that stops cleanly releases its lease: another instance takes over at its next attempt.
- A leader that crashes keeps its lease until it expires: another instance takes over within `leaseDuration` plus `renewInterval`.
