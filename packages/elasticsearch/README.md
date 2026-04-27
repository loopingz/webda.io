# @webda/elasticsearch module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/elasticsearch

> Elasticsearch indexing service for Webda — automatically mirrors model saves to one or more Elasticsearch indices, with optional date-split partitioning and a search/delete API.

## When to use it

- You want full-text or aggregation queries on your Webda models without changing your primary store.
- You need time-series index partitioning (daily/monthly/yearly) for log or metric models.
- You want to expose a search endpoint directly from Webda without writing custom ES glue code.

## Install

```bash
pnpm add @webda/elasticsearch
```

## Configuration

```json
{
  "services": {
    "search": {
      "type": "ElasticSearchService",
      "client": {
        "node": "http://localhost:9200"
      },
      "indexes": {
        "posts": {
          "model": "MyApp/Post",
          "url": "/search/posts"
        },
        "events": {
          "model": "MyApp/Event",
          "url": "/search/events",
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
| `indexes.<n>.url` | string | — | No | URL prefix to expose search/delete endpoints |
| `indexes.<n>.dateSplit.frequency` | string | `"monthly"` | No | Time-based index split: `yearly`, `monthly`, `weekly`, `daily`, or `hourly` |
| `indexes.<n>.dateSplit.attribute` | string | — | No | Model attribute containing the date used for index partitioning |

## Usage

```typescript
import { Service } from "@webda/core";
import { Bean, Inject } from "@webda/core";
import ElasticSearchService from "@webda/elasticsearch";

@Bean
export class PostSearchService extends Service {
  @Inject("search")
  es: ElasticSearchService;

  async findPosts(query: string): Promise<any[]> {
    const result = await this.es.search("posts", {
      query: { match: { title: query } }
    });
    return result.hits.hits.map(h => h._source);
  }
}

// Documents are indexed automatically when Post models are saved/updated/deleted
// via the Store event listener wired up in ElasticSearchService.resolve()
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/elasticsearch/`.
- Source: [`packages/elasticsearch`](https://github.com/loopingz/webda.io/tree/main/packages/elasticsearch)
- Related: [`@webda/core`](../core) for the `Store` base class and model events; [`@webda/aws`](../aws) for `DynamoStore` as a primary store to pair with.

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
