---
sidebar_label: "@webda/fs"
---
# fs

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
- Related: [`@webda/aws`](_media/aws) for `DynamoStore` and `S3Binary` as cloud-native replacements; [`@webda/mongodb`](_media/mongodb) for a MongoDB-backed store; [`@webda/core`](_media/core) for the `Store`, `Binary`, and `Queue` base classes.
