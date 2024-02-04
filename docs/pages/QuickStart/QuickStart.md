---
sidebar_position: 1
---

# Quick Start

Initiate the project

```
npx @webda/shell init
```

It will create the default structure

Configure the project

```
webda config
```

## Use auto-completion in Visual Code

By executing `webda module` or `webda configuration-schema`, you will create two files

```
.webda-config-schema.json
.webda-deployment-schema.json
```

They are the dynamicly generated JSON Schemas.

If you have the `"$schema": ".webda-config-schema.json"` in your webda.config.json
and the `"$schema": "../.webda-deployment-schema.json"` in each of your deployment files

You will be able to use the dynamic auto-completion when editing these files

## HTTP Client

We recommend using [axios](https://www.npmjs.com/package/axios)
