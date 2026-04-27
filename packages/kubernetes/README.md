# @webda/kubernetes module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/kubernetes

> Kubernetes integration for Webda — `KubeRunner` dispatches async jobs as Kubernetes batch Jobs, `KubernetesSecretsStore` reads model data from K8s Secrets, and `CronJobDeployer` manages CronJob lifecycle.

## When to use it

- You are using `@webda/async` and want async job workers to run as Kubernetes Jobs (one pod per job, auto-retried, auto-cleaned).
- You want to store Webda model instances in Kubernetes Secrets (useful for small, sensitive configuration objects).
- You need to deploy a scheduled Webda service operation as a Kubernetes CronJob.

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

[<img src="https://arize.com/hubfs/arize/brand/arize-logomark-1.png" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://loopingz.com/images/logo.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://tellae.fr/" width="200">](https://tellae.fr)
