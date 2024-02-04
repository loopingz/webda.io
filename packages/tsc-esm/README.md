# @webda/tsc-esm module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

This is a wrapper around tsc to compile typescript to esm format without the culprit of having to add '.js' at the end of your import.

When you work with typescript this is valid

```
import { MyClass } from './myclass';
```

But the official compiler will generate a file named `myclass.js` and you will have to write

```
import { MyClass } from './myclass.js';
```

This is not really clean in my opinion, so this wrapper will allow you to use the first syntax and will take care of fixing the `.js` issue for you.

Reference on the famous issue on typescript: https://github.com/microsoft/TypeScript/issues/16577

## Usage

You can run the compiler directly with

```bash
npx @webda/tsc-esm
```

Or add it to your project with

```
# NPM
npm add --dev @webda/tsc-esm
# Yarn
yarn add --dev @webda/tsc-esm
# pnpm
pnpm add --dev @webda/tsc-esm
```

Update your `package.json` to add a script

```json
{
  "scripts": {
    "build": "tsc-esm"
  }
}
```

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
