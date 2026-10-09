---
sidebar_position: 11
sidebar_label: "11 — Next Steps"
---

# 11 — Next Steps

**Goal:** Point you toward the modules and documentation that take the blog API from a development prototype to a production system.

**Files touched:** _(no new files — curated links only)_

**Concepts:** authentication, persistent stores, deployment, testing, more transports.

---

You have built a blog API served over REST, GraphQL and gRPC from one set of TypeScript models, with validation and permissions declared on the models. Here is where to go next.

## Authentication

The blog handles accounts itself (`User.register` / `User.login`, bcrypt hashes in a private field), which keeps the tutorial self-contained. For a real application, use [`@webda/auth`](../../Security/Authentication.md): login providers (email and password with verification and recovery, OAuth), account linking, and access/refresh tokens. The `canAct` rules you wrote keep working: they only read `context.getCurrentUserId()`.

## Persistent stores

Models are saved in the default `Registry` store, in memory. Switching to a database is a configuration change: replace the `Registry` service in `webda.config.json` and add the package. No model code changes.

| Store      | Package           | `Registry` configuration                                   | Connection                                               |
| ---------- | ----------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| files      | `@webda/fs`       | `{ "type": "Webda/FileStore", "folder": "./data" }`        |                                                          |
| MongoDB    | `@webda/mongo`    | `{ "type": "Webda/MongoStore", "collection": "registry" }` | `WEBDA_MONGO_URL`                                        |
| PostgreSQL | `@webda/postgres` | `{ "type": "Webda/PostgresStore", "table": "registry" }`   | `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` |

```json title="webda.config.json (services excerpt)"
{
  "services": {
    "Registry": { "type": "Webda/PostgresStore", "table": "registry" }
  }
}
```

Credentials come from environment variables, never from the configuration file. `npm create @webda my-app -- --store postgres` sets this up with a `docker-compose.yml` and a `.env.example`. See [Stores](../../Concepts/Stores/Stores.md), [`@webda/mongodb`](../../Modules/mongodb/README.md) and [`@webda/postgres`](../../Modules/postgres/README.md).

## Deployment

Environments are files in `deployments/<name>.json`: their `parameters` and `services` override `webda.config.json`, and their `units` list the deployers. Select one with `-d <name>` placed **before** the command (`npx webda -d production serve`) or with `WEBDA_DEPLOYMENT=production`.

| Target                                   | Package      | Deployer types                                         |
| ---------------------------------------- | ------------ | ------------------------------------------------------ |
| Container image (built without Docker)   | `@webda/oci` | `Webda/ContainerDeployer`                              |
| AWS Lambda package, CloudFormation stack | `@webda/aws` | `Webda/LambdaPackager`, `Webda/CloudFormationDeployer` |

```bash
npm install @webda/oci
npm run build
npx webda -d production container push
```

See [Deployments](../../Deployments/Deployments.md), [Kubernetes](../../Deployments/Kubernetes/Kubernetes.md) and [`@webda/aws`](../../Modules/aws/README.md).

## Testing

The generated `test/app.spec.ts` loads the application from `lib/` with `WebdaApplicationTest` from `@webda/core`. Get models with `useModel("MyBlog/Post")` and services with `useService("Publisher")` rather than importing them from `src/`, and run `npm test` (it builds first). The sample's `test/api-test.ts` goes further: it sends REST requests through the router as a given user, which is how the blog permissions are tested. See [`@webda/test`](../../Modules/test/README.md).

## More transports

- **MCP** — `npm install @webda/mcp` and `"MCP": { "type": "Webda/McpService" }` expose the operations as Model Context Protocol tools and the models as resources, for AI assistants. The sample app's README shows how to connect Claude Code to it.
- **GraphQL subscriptions** — see [Subscriptions](../../Modules/graphql/Subscriptions.md).

## Other features of the sample app

`sample-apps/blog-system` also shows:

- binary attachments on `Post` (`Binary` and `Binaries` attributes, stored by `Webda/FileBinary`);
- an audit log of every write (`Webda/AuditService`), with `setOperationSubject` in `Publisher.publishPost`;
- an admin web UI served by `Webda/ResourceService` at `/admin`;
- HTTPS and HTTP/2 on the main port with `"autoTls": true`.

## Other packages you may find useful

| Package                | Description                                    | Link                                                            |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| `@webda/otel`          | OpenTelemetry traces, metrics and logs         | [`@webda/otel`](../../Modules/otel/README.md)                   |
| `@webda/mock`          | Coherent mock data for `@webda/models` classes | [`@webda/mock`](../../Modules/mock/README.md)                   |
| `@webda/elasticsearch` | Elasticsearch integration                      | [`@webda/elasticsearch`](../../Modules/elasticsearch/README.md) |
| `@webda/cache`         | Method-level caching with decorators and TTL   | [`@webda/cache`](../../Modules/cache/README.md)                 |
| `@webda/amqp`          | AMQP (RabbitMQ) queues                         | [`@webda/amqp`](../../Modules/amqp/README.md)                   |
| `@webda/cloudevents`   | CloudEvents discovery and subscriptions        | [`@webda/cloudevents`](../../Modules/cloudevents/README.md)     |

---

(end of tutorial — return to the [QuickStart index](../QuickStart.md))
