---
sidebar_position: 20
---
# Monitoring

Webda provides built-in metrics and observability for stores, repositories, services, and operations.

## Store Metrics

Each store exposes Prometheus metrics prefixed by the store's sanitized name (e.g. `memory_`, `db_`):

| Metric | Type | Labels | Description |
| --- | --- | --- | --- |
| `<store>_operations_total` | Counter | `operation` | Total store CRUD operations executed |
| `<store>_queries` | Histogram | `operation`, `model` | Query execution latency in milliseconds |
| `<store>_slow_queries_total` | Counter | `operation`, `model` | Total number of queries exceeding `slowQueryThreshold` |

See [Repositories](../Concepts/Stores/Repositories.md#slow-queries) for slow query configuration and details.
