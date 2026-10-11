# @webda/create module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

Create a [Webda](https://webda.io) v4 application, ready for coding agents.

```bash
npm create @webda my-app
pnpm create @webda my-app --store postgres --transports rest,graphql --yes
```

| Flag                       | Values                                         | Default                                 |
| -------------------------- | ---------------------------------------------- | --------------------------------------- |
| `--store`                  | `memory`, `file`, `mongodb`, `postgres`        | `memory`                                |
| `--transports`             | comma list of `rest`, `graphql`, `grpc`, `mcp` | `rest`                                  |
| `--namespace`              | application namespace                          | from the directory name                 |
| `--pm`                     | `pnpm`, `npm`, `yarn`                          | the package manager running the command |
| `--no-install`, `--no-git` | skip install / git init                        |                                         |
| `--yes`, `-y`              | accept defaults, never prompt                  |                                         |

With `npm`, the generated app also gets a `.npmrc` setting `legacy-peer-deps=true`: npm 10 (bundled with Node 22) crashes
on the optional peer dependencies of vitest/vite. It is safe to remove with npm >= 11.

The generated app contains `AGENTS.md`, `CLAUDE.md` and skills in `.agents/skills/`.
In an existing v4 project, Claude Code users can install the same skills:

```text
/plugin marketplace add loopingz/webda.io
/plugin install webda@webda
```

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
