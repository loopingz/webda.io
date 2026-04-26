# @webda/serialize module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/serialize

> Type-preserving JavaScript serializer — round-trips `Date`, `Map`, `Set`, `Buffer`, `RegExp`, `BigInt`, `NaN`, `Infinity`, circular references, and your own custom classes through `JSON.stringify` without data loss.

## When to use it

- You need to serialize/deserialize objects that contain non-JSON types (dates, maps, sets, circular refs) across process boundaries (queue messages, Redis cache, IPC).
- You have domain model classes that must survive a round-trip through a JSON store without losing their prototype chain.
- You want `JSON.stringify` + `JSON.parse` semantics but with automatic type reconstruction on the other side.

## Install

```bash
pnpm add @webda/serialize
```

## Configuration

`@webda/serialize` is a pure library with no Webda service or `webda.config.json` entry. Import and call directly.

## Usage

```typescript
import { serialize, deserialize, registerSerializer } from "@webda/serialize";

// Built-in type support — no registration needed
const obj = {
  date: new Date("2024-01-01"),
  map: new Map([["key", "value"]]),
  set: new Set([1, 2, 3]),
  re: /hello/i,
  inf: Infinity,
  nan: NaN,
  buf: Buffer.from("Hello")
};

const json = serialize(obj);          // JSON string with $serializer metadata
const restored = deserialize(obj);    // all types reconstructed correctly
// restored.date instanceof Date === true
// restored.map instanceof Map === true

// Register a custom class
class Point {
  constructor(public x: number, public y: number) {}

  toJSON() { return { x: this.x, y: this.y }; }

  static deserialize(data: any): Point {
    return new Point(data.x, data.y);
  }
}

registerSerializer(Point);  // uses class name "Point" as type tag

const p = new Point(1, 2);
const restored2 = deserialize<Point>(serialize(p));
// restored2 instanceof Point === true

// Circular references are handled automatically
const a: any = { name: "root" };
a.self = a;
const json2 = serialize(a);          // no "Converting circular structure" error
const restored3 = deserialize(json2); // restored3.self === restored3
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/serialize/`.
- Source: [`packages/serialize`](https://github.com/loopingz/webda.io/tree/main/packages/serialize)
- Related: [`@webda/core`](../core) for `JSONUtils` which uses this package internally; [`@webda/utils`](../utils) for file/YAML serialization helpers.

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
