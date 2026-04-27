# @webda/fs module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/fs

> Filesystem-backed Store, Binary, and Queue implementations for Webda — ideal for local development, testing, or single-instance deployments where you want persistence without an external database.

## When to use it

- You are developing or running unit tests locally and need a zero-config persistent store without spinning up a database.
- You need to store file uploads on local disk (e.g. a blog system or a small self-hosted app) using `FileBinary`.
- You want a file-backed queue (`FileQueue`) for sequential task processing in a single-process scenario.

## Install

```bash
pnpm add @webda/fs
```

## Configuration

```json
{
  "services": {
    "postStore": {
      "type": "FileStore",
      "model": "MyApp/Post",
      "folder": "./data/posts"
    },
    "uploads": {
      "type": "FileBinary",
      "folder": "./data/uploads",
      "maxSize": 10485760
    },
    "fileQueue": {
      "type": "FileQueue",
      "folder": "./data/queue"
    }
  }
}
```

### FileStore parameters

| Parameter | Type | Default | Required | Description |
|---|---|---|---|---|
| `folder` | string | — | Yes | Directory where each model instance is stored as a JSON file |
| `beautify` | string \| number | — | No | Indentation passed to `JSON.stringify` (e.g. `2` for pretty-print) |

### FileBinary parameters

| Parameter | Type | Default | Required | Description |
|---|---|---|---|---|
| `folder` | string | — | Yes | Directory where uploaded binaries are stored |
| `maxSize` | number | `10485760` | No | Maximum accepted upload size in bytes (default 10 MB) |
| `url` | string | — | No | URL prefix for direct-download links |

## Usage

```typescript
import { CoreModel, Model, Expose, BinaryFile, BinaryMap } from "@webda/core";
import { Bean, Inject } from "@webda/core";
import { Store } from "@webda/core";

@Model()
export class Post extends CoreModel {
  @Expose()
  title: string;

  @BinaryMap({ cardinality: "ONE" })
  cover: BinaryFile;
}

// In webda.config.json: configure FileStore (model storage) and FileBinary (uploads)
// Webda auto-wires them — no extra service code required.

// Programmatic usage
@Bean
export class PostService extends Service {
  @Inject("postStore")
  store: Store<Post>;

  async createPost(title: string): Promise<Post> {
    const post = new Post();
    post.title = title;
    return post.save();
  }

  async listPosts(): Promise<Post[]> {
    return (await Post.query("")).results;
  }
}
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/fs/`.
- Source: [`packages/fs`](https://github.com/loopingz/webda.io/tree/main/packages/fs)
- Related: [`@webda/aws`](../aws) for `DynamoStore` and `S3Binary` as cloud-native replacements; [`@webda/mongodb`](../mongodb) for a MongoDB-backed store; [`@webda/core`](../core) for the `Store`, `Binary`, and `Queue` base classes.

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
