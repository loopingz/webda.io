# Knative and Cloud Run

`Webda/KnativeDeployer` (`@webda/kubernetes`) deploys the application as a
[Knative Serving](https://knative.dev/docs/serving/) `Service`: a container serving HTTP, scaled on demand
(down to zero), with revisions and traffic splitting. Google Cloud Run implements the same API, so the same
manifest works there with `platform: "cloudrun"`.

The deployer only needs a cluster with Knative Serving installed (and an ingress like Kourier or Istio), or
a Cloud Run project: installing them is out of scope.

## Setup

Declare the deployer as a unit of a deployment, usually after the [`Webda/ContainerDeployer`](./Docker.md)
building the image:

```jsonc title="deployments/production.jsonc"
{
  "units": [
    {
      "name": "image",
      "type": "Webda/ContainerDeployer",
      "image": "ghcr.io/acme/api",
      "tags": ["${git.version}"]
    },
    {
      "name": "knative",
      "type": "Webda/KnativeDeployer",
      "containerDeployer": "image",
      "namespace": "apps",
      "minScale": 1,
      "maxScale": 20,
      "containerConcurrency": 80,
      "env": { "NODE_ENV": "production" },
      "envFrom": [{ "secretRef": { "name": "api-secrets" } }],
      "traffic": [
        { "latestRevision": true, "percent": 90 },
        { "revisionName": "api-4f2a1c3", "percent": 10, "tag": "previous" }
      ]
    }
  ]
}
```

```bash
webda -d production knative manifest   # prints the Service, touches nothing
webda -d production deploy             # pushes the image, applies the Service, waits for Ready
webda -d production knative status     # URL, revisions and traffic
webda -d production knative delete --yes
```

`deploy` runs the `deploy` command of every unit of the deployment: with `containerDeployer` set, the Knative
unit calls the image unit itself and pins the revision to the pushed digest
(`ghcr.io/acme/api@sha256:...`), so leave the `ContainerDeployer` unit first or let the Knative unit push
for it. Without `containerDeployer`, set `image` to the reference to deploy (templates like
`${git.version}` apply).

The Service is created, then [server-side applied](https://kubernetes.io/docs/reference/using-api/server-side-apply/)
with the `webda` field manager: fields set by other tools (a `kubectl annotate`) are kept, the fields of the
manifest are owned by webda. `deploy` then waits for the `Ready` condition of the new generation
(`readyTimeout`, 300s) and prints the URL; a `Ready=False` condition fails the command with its reason and
message (`KNATIVE_NOT_READY`).

## Runtime: what the application does for Knative

Nothing specific is needed in the application:

- **Port**: Knative and Cloud Run inject the `PORT` environment variable; the `HttpServer` listens on it when
  its `port` parameter is not set (the configuration always wins over the environment).
- **Readiness**: the deployer sets `WEBDA_HEALTH_PATH` in the container to `healthPath` (`/healthz`), which
  enables the probe route of the `HttpServer`. It answers `200 {"status":"ok"}` once `Core` finished `init()`,
  `503 {"status":"starting"}` before, and `503 {"status":"stopping"}` while the server drains. The route is
  answered before the routing and needs no authentication. Set `healthPath` to `""` for a TCP probe instead.
- **Graceful shutdown**: on `SIGTERM`, the CLI stops the `HttpServer`: it refuses new connections, answers
  `503` on the health path and waits for the in-flight requests up to `shutdownGracePeriod` (10s), then
  closes the remaining connections and stops the services. Keep `shutdownGracePeriod` below the revision
  `timeoutSeconds` (Knative uses it as the pod termination grace period) and expect requests longer than the
  grace period to be cut.

```json title="webda.config.json (optional, the environment enables the same)"
{
  "services": {
    "HttpServer": { "healthPath": "/healthz", "shutdownGracePeriod": 10000 }
  }
}
```

## Parameters

Every string accepts the deployment templates (`${package.version}`, `${git.short}`, `${deployment}`,
`${deployer.name}`, `${env.MY_VAR}`, ...).

| Parameter              | Type                                                  | Default                                        | Description                                                                                                                           |
| ---------------------- | ----------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `config` / `context`   | string \| object / string                             | default kubeconfig                             | Cluster access, see [Kubernetes](./Kubernetes/Kubernetes.md); `config` can be encrypted with `webda config encrypt`                   |
| `timeout`              | number                                                | —                                              | Milliseconds before a Kubernetes API request is aborted                                                                               |
| `platform`             | `"knative"` \| `"cloudrun"`                           | `"knative"`                                    | Adjusts the manifest for Cloud Run, see below                                                                                         |
| `namespace`            | string                                                | `"default"`                                    | Namespace of the Service (the project on Cloud Run)                                                                                   |
| `name`                 | string                                                | `"${package.name}"`                            | Name of the Service, sanitized to a DNS-1123 label (`@acme/api` gives `acme-api`)                                                     |
| `image`                | string                                                | —                                              | Image to deploy, required unless `containerDeployer` provides it                                                                      |
| `containerDeployer`    | string                                                | —                                              | Name of a `Webda/ContainerDeployer` unit: `deploy` pushes with it and deploys the digest                                              |
| `env`                  | object                                                | `{}`                                           | Environment variables, `WEBDA_HEALTH_PATH` is added from `healthPath`                                                                 |
| `envFrom`              | `{ secretRef?, configMapRef?, prefix? }[]`            | `[]`                                           | Secrets and ConfigMaps loaded as environment variables                                                                                |
| `minScale`             | number                                                | `0`                                            | `autoscaling.knative.dev/min-scale`: `0` scales to zero when idle                                                                     |
| `maxScale`             | number                                                | —                                              | `autoscaling.knative.dev/max-scale`                                                                                                   |
| `target`               | number                                                | —                                              | `autoscaling.knative.dev/target`: concurrent requests per replica the autoscaler aims for                                             |
| `containerConcurrency` | number                                                | `0`                                            | Hard limit of concurrent requests per replica, `0` for unlimited (Node handles concurrency, do not use `1`)                           |
| `timeoutSeconds`       | number                                                | `300`                                          | Request timeout of the revision                                                                                                       |
| `resources`            | `{ limits?, requests? }`                              | —                                              | Compute resources of the container                                                                                                    |
| `port`                 | number                                                | `8080`                                         | `containerPort`, injected as `PORT`                                                                                                   |
| `healthPath`           | string                                                | `"/healthz"`                                   | Readiness probe path, `""` for a TCP probe                                                                                            |
| `traffic`              | `{ revisionName?, latestRevision?, percent, tag? }[]` | `[{ "latestRevision": true, "percent": 100 }]` | Traffic split, a `tag` gives the target its own URL                                                                                   |
| `revisionSuffix`       | string                                                | `"${git.short}"`                               | Revision name `<name>-<suffix>`, `""` to let Knative generate it                                                                      |
| `serviceAccountName`   | string                                                | —                                              | Service account of the pods                                                                                                           |
| `visibility`           | `"public"` \| `"cluster-local"`                       | `"public"`                                     | `cluster-local` keeps the Service off the external ingress                                                                            |
| `annotations`          | object                                                | `{}`                                           | Annotations of the revision template, added to the autoscaling ones (set `autoscaling.knative.dev/class` here for the HPA autoscaler) |
| `labels`               | object                                                | `{}`                                           | Labels of the revision template                                                                                                       |
| `template`             | object \| string                                      | —                                              | Overrides deep-merged on the generated Service: an object or the path of a YAML/JSON file; arrays replace                             |
| `output`               | string                                                | —                                              | File the manifest is written to: `knative manifest` writes it instead of printing, `deploy` writes it before applying                 |
| `readyTimeout`         | number                                                | `300`                                          | Seconds `deploy` waits for the Service to be Ready                                                                                    |

### Revisions

With the default `revisionSuffix`, the revision is named after the commit (`api-4f2a1c3`): deploying the
same commit twice applies the same template and creates no new revision. Knative refuses a different template
under an existing revision name, so a configuration change without a new commit needs another suffix
(`"${git.short}-${env.BUILD_NUMBER}"`), or `revisionSuffix: ""` to let Knative generate names (then every
apply with a change creates a revision, identical applies still do not).

### Overrides

`template` is deep-merged on the generated Service, for anything the parameters do not cover:

```jsonc
{
  "type": "Webda/KnativeDeployer",
  "image": "ghcr.io/acme/api:${git.version}",
  "template": {
    "spec": { "template": { "spec": { "nodeSelector": { "kubernetes.io/arch": "arm64" } } } }
  }
}
```

A string is the path of a YAML or JSON file relative to the application, with the same templates. Arrays
(`containers`, `traffic`, `envFrom`) replace the generated ones.

## Cloud Run

`platform: "cloudrun"` produces a manifest `gcloud run services replace` accepts; applying through the
Google API is not supported, run `gcloud` on the `knative manifest` output:

```bash
webda -d production knative manifest --output service.yaml
gcloud run services replace service.yaml --region europe-west1
```

Differences with the Knative manifest, logged as warnings when a parameter is dropped:

- `namespace` is left out unless set: on Cloud Run it is the project id or number.
- The autoscaling annotations are `autoscaling.knative.dev/minScale` and `maxScale`; `target` is ignored,
  Cloud Run scales on `containerConcurrency`.
- `containerConcurrency` is capped to 1000, and `0` is left out (the Cloud Run default is 80);
  `timeoutSeconds` is capped to 3600.
- `envFrom` is not supported: reference secrets with `template` (`valueFrom.secretKeyRef`) or mount them.
- The readiness probe becomes a startup probe, Cloud Run has no readiness probe.
- `visibility: "cluster-local"` becomes the `run.googleapis.com/ingress: internal` annotation.

## Scaling and cold starts

A scale-from-zero request waits for the pod scheduling, the image pull (cached after the first one) and the
application startup. The startup of `sample-app` (every Webda module, packaged with `webda package`) was
measured at **2.6s** median (2.4s to 2.7s over 5 runs, one outlier at 4.9s), from the process spawn to the
HTTP port accepting connections, on Node v22.19 and an Apple M-series laptop; unpackaged (`webda serve` with
the module scan) it was 2.8s. Add the pod scheduling (1-3s on an idle node) for the cold start seen by the
first request.

- Keep `minScale: 0` for batch-like or internal services where a few seconds of latency do not matter.
- Set `minScale: 1` for latency-sensitive services: it keeps one replica warm at the cost of its resources.
- `maxScale` bounds the burst; `target` (default 100 concurrent requests per replica) decides when a replica
  is added, `containerConcurrency` is a hard limit the queue proxy enforces.

## Stateless rules

Knative starts and stops replicas at any time: every replica must be disposable.

- No in-memory sessions: use a cookie session or a store-backed `SessionManager`.
- No in-memory locks or caches holding state between requests: use a store, a queue or a shared cache.
- No local files beyond the request: use a `Binary` store.
- Long-running jobs do not belong in a request: a revision times out at `timeoutSeconds`.
- Pull-based queue consumers (`webda worker`, `AsyncJobService` with a queue) belong on a Deployment scaled with
  [KEDA](https://keda.sh/), not on a Knative Service: Knative scales on HTTP traffic and stops idle
  replicas, a consumer polling a queue is never idle from its point of view.
