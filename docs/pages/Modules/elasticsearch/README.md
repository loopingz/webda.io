---
sidebar_label: "@webda/elasticsearch"
---
# elasticsearch

> Elasticsearch indexing service for Webda — automatically mirrors model saves to one or more Elasticsearch indices, with optional date-split partitioning and a `search()` API.

## When to use it

- You want full-text or aggregation queries on your Webda models without changing your primary store.
- You need time-series index partitioning (daily/monthly/yearly) for log or metric models.
- You want to search your models from your own services with the Elasticsearch query DSL, without writing the indexing glue.

## Install

```bash
pnpm add @webda/elasticsearch
```

## Configuration

```json
{
  "services": {
    "search": {
      "type": "Webda/ElasticSearchService",
      "client": {
        "node": "http://localhost:9200"
      },
      "indexes": {
        "posts": {
          "model": "MyApp/Post"
        },
        "events": {
          "model": "MyApp/Event",
          "dateSplit": {
            "frequency": "daily",
            "attribute": "createdAt"
          }
        }
      }
    }
  }
}
```

| Parameter | Type | Default | Required | Description |
|---|---|---|---|---|
| `client` | object | — | Yes | Elasticsearch `ClientOptions` passed directly to `@elastic/elasticsearch` Client constructor (e.g. `{ node, auth }`) |
| `indexes` | object | `{}` | Yes | Map of index name → index configuration |
| `indexes.<n>.model` | string | — | Yes | Fully qualified model name to index (e.g. `"MyApp/Post"`) |
| `indexes.<n>.dateSplit.frequency` | string | `"monthly"` | No | Time-based index split: `yearly`, `monthly`, `weekly`, `daily`, or `hourly` |
| `indexes.<n>.dateSplit.attribute` | string | — | No | Model attribute containing the date used for index partitioning |

The service registers no route: search the indexes from your code with `search(index, query, from?, context?)`, which
returns the hits loaded as instances of the index model, as the caller (the current context by default):

- a hit is kept only when the caller may read it, `canAct(context, "get", hit)` of the index model, the check of the
  model query operation; a model without permission check returns no hit;
- hits are filtered after Elasticsearch answers, so a page can hold fewer hits than asked for, and `from` counts the
  Elasticsearch hits. The model's `getPermissionQuery` is WebdaQL and is not sent to Elasticsearch: add the matching
  Elasticsearch filter to your query (for example the owner field) to avoid short pages.

`searchUnchecked(index, query, from?)` returns every hit without permission check, for trusted code only (jobs,
migrations), never with client input.

## Usage

```typescript
import { Service } from "@webda/core";
import { Bean, Inject } from "@webda/core";
import { ElasticSearchService } from "@webda/elasticsearch";

@Bean
export class PostSearchService extends Service {
  @Inject("search")
  es: ElasticSearchService;

  async findPosts(query: string): Promise<Post[]> {
    // Returns the hits the current caller may read, loaded as instances of the index model
    return this.es.search<Post>("posts", {
      query: { match: { title: query } }
    });
  }
}

// Documents are indexed automatically when Post models are saved/updated/deleted
// via the Store event listener wired up in ElasticSearchService.resolve()
```

## Reference

- Source: [`packages/elasticsearch`](https://github.com/loopingz/webda.io/tree/main/packages/elasticsearch)
- Related: [Stores](../core/Stores.md) for the store events the index follows; [`@webda/aws`](../aws/README.md) for `DynamoStore` as a primary store to pair with.
