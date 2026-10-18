# @webda/oci module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

Build and push OCI container images of a Webda application without Docker.

The `Webda/ContainerDeployer` adds one layer to a base image: the packaged application (the package files, its
production dependencies and the deployed configuration). The layer is reproducible, so the same sources give the same
image digest on any machine.

## Installation

```bash
pnpm add -D @webda/oci
```

## Usage

Declare the deployer as a unit of a deployment:

```json title="deployments/production.json"
{
  "units": [
    {
      "name": "Image",
      "type": "Webda/ContainerDeployer",
      "baseImage": "node:22-slim@sha256:<digest>",
      "image": "ghcr.io/my-org/my-app"
    }
  ]
}
```

Then run:

```bash
webda -d production container build   # build into an OCI layout (or a .tar archive)
webda -d production container push    # build and push to the registry
webda -d production deploy            # same as container push, as part of the deployment
```

## Parameters

Every string accepts the deployment templates: `${package.version}`, `${git.commit}`, `${deployment}`,
`${deployer.name}`, `${env.MY_VAR}`, ...

| Parameter            | Default                                                         | Description                                                     |
| -------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `baseImage`          | `node:22-slim`                                                  | Base image, `scratch` for none                                  |
| `image`              |                                                                 | Repository to push to, without tag; required to push            |
| `tags`               | `["${git.version}"]`                                            | Tags of the image, invalid characters are replaced by `-`       |
| `workdir`            | `/app`                                                          | Folder of the application in the image                          |
| `entrypoint`         | `["node", "<workdir>/node_modules/@webda/core/lib/bin/cli.js"]` | Entrypoint of the image                                         |
| `cmd`                | `["serve", "--bind", "0.0.0.0"]`                                | Arguments of the entrypoint                                     |
| `env`                | `{ "NODE_ENV": "production" }`                                  | Environment variables                                           |
| `labels`             |                                                                 | Labels added to the default OCI ones                            |
| `user`               | the base image one                                              | User the container runs as                                      |
| `exposedPorts`       | `["18080/tcp"]`                                                 | Exposed ports                                                   |
| `platforms`          | `["linux/amd64"]`                                               | Platforms to build, several produce a multi-platform index      |
| `output`             | `.webda/oci/${deployer.name}`                                   | OCI layout folder, or a tar archive when ending with `.tar`     |
| `mtime`              | `SOURCE_DATE_EPOCH`, or `0`                                     | Modification time of the files and creation time of the image   |
| `credentials`        |                                                                 | Credentials per registry host, override `~/.docker/config.json` |
| `insecureRegistries` |                                                                 | Registries reached over plain http (`localhost` always is)      |

## Registry credentials

Credentials come from `~/.docker/config.json` (including credential helpers), unless the `credentials` parameter sets
them for a host. Read them from the environment with templates, or commit them encrypted with `webda config encrypt`:

```json
{
  "credentials": {
    "ghcr.io": { "username": "${env.GHCR_USER}", "password": "${env.GHCR_TOKEN}" }
  }
}
```

## Reproducible images

- every file of the layer has the same owner, permissions (only the executable bit is kept) and modification time, and
  the files are sorted;
- the creation date and modification time are `SOURCE_DATE_EPOCH` (in seconds), `0` by default;
- the base image must be pinned by digest for the image to stay the same over time: the build warns when it is not;
- `node_modules` comes from your lockfile: install with `--frozen-lockfile`.

## Library

The building blocks are exported for custom tooling: `buildImage`, `pushImage`, `writeLayoutArchive`, `ImageLayout`,
`RegistryClient`, `parseImageReference`, `generateTar`, ...

## See also

- [Docker deployment](https://webda.io/docs/Deployments/Docker)
- [Deployments](https://webda.io/docs/Deployments)

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
