# @webda/debug-ui module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

The React dashboard of the Webda debug server, shared by the [hosted dashboard](https://webda.io/debug/) and by
`webda debug --web --local`.

This package is private: it is bundled into `@webda/debug` and the documentation site, and is not published.

## What it shows

The dashboard reads the debug server started by `webda debug` (port `18181` by default) and has six panels: models
and their relations, services and their configuration, operations with their schemas, the live request log, the
application logs and the resolved configuration.

```bash
webda debug --web            # opens https://webda.io/debug/?port=18181#token=…
webda debug --web --local    # opens http://127.0.0.1:18181/#code=… served by the debug server itself
```

See [Debug dashboard & telemetry](https://webda.io/docs/Debug/DebugDashboard) for the security model: per-session
token, loopback only, single-use code for the local page.

## Usage

```tsx
import { DebugConnectionProvider, DebugDashboard } from "@webda/debug-ui";
import "@webda/debug-ui/styles.css";

export function Debug({ token, port }: { token: string; port: number }) {
  return (
    <DebugConnectionProvider mode="hosted" token={token} port={port}>
      <DebugDashboard initialPanel="models" />
    </DebugConnectionProvider>
  );
}
```

| Export                        | Content                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| `@webda/debug-ui`             | `DebugDashboard`, `DebugConnectionProvider`, debug client, session helpers |
| `@webda/debug-ui/standalone`  | The standalone page (theme toggle, bootstrap code exchange)                |
| `@webda/debug-ui/styles.css`  | Dashboard styles                                                           |
| `@webda/debug-ui/tokens.css`  | Design tokens, shared with the documentation site                          |
| `@webda/debug-ui/hosted-dist` | The built hosted page, copied to the docs site by `sync-debug-ui.js`       |

## Development

```bash
pnpm build          # library, styles and the hosted page (dist/hosted)
pnpm build:hosted   # only the hosted page
pnpm test
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
