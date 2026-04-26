---
sidebar_position: 1
---

:::warning Stale — under revision
Parts of this page reference the removed `@webda/shell` package and the
`npx @webda/shell init` flow. The current entry points are `webda` (from
`@webda/core`) and `webdac` (from `@webda/compiler`). For an up-to-date
walkthrough, see [Tutorial-BlogSystem](./Tutorial-BlogSystem/00-Overview).
:::

# Quick Start

Initiate the project

```shell
npx @webda/shell init
```

It will create the default structure

Configure the project

```shell
webda config
```

## Use auto-completion in Visual Code

By executing `webda module` or `webda configuration-schema`, you will create two files

```shell
.webda-config-schema.json
.webda-deployment-schema.json
```

They are the dynamicly generated JSON Schemas.

If you have the `"$schema": ".webda-config-schema.json"` in your webda.config.json
and the `"$schema": "../.webda-deployment-schema.json"` in each of your deployment files

You will be able to use the dynamic auto-completion when editing these files

## HTTP Client

We recommend using [axios](https://www.npmjs.com/package/axios)
