# @webda/azure module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

Azure Blob storage, Cosmos DB, Service Bus, Key Vault, Monitor logging, Container Apps and Functions integrations for Webda.

## Install

```sh
pnpm add @webda/azure
```

## Credentials

`getAzureCredential(params)` returns an Azure SDK `TokenCredential`. Complete service-principal parameters select `ClientSecretCredential`; other configurations use `DefaultAzureCredential`, including Azure CLI, managed identity and workload identity authentication.

```typescript
import { getAzureCredential, loadAzureParameters } from "@webda/azure";

const params = loadAzureParameters({ endpoint: "http://127.0.0.1:10000/devstoreaccount1" });
const credential = getAzureCredential(params);
// Pass credential to your Azure SDK client. Use params.endpoint for the service's emulator endpoint.
```

| Parameter        | Environment fallback    | Purpose                                               |
| ---------------- | ----------------------- | ----------------------------------------------------- |
| `tenantId`       | `AZURE_TENANT_ID`       | Microsoft Entra tenant                                |
| `clientId`       | `AZURE_CLIENT_ID`       | Service principal or user-assigned identity client    |
| `clientSecret`   | `AZURE_CLIENT_SECRET`   | Service principal secret (`string` or `SecretString`) |
| `subscriptionId` | `AZURE_SUBSCRIPTION_ID` | Resource subscription                                 |
| `endpoint`       | —                       | Service-specific endpoint, such as Azurite            |

Service parameter classes implementing `AzureServiceParameters` can call `loadAzureParameters(this)` from `load()`. It fills absent fields and returns the same object, preserving explicit values and encrypted `SecretString` instances. `getAzureCredential` resolves defaults in a copy, so it preserves its input. It forwards the configured tenant/client to the default chain's managed and workload identity options; the SDK also honors its standard authentication environment variables.

Use managed or workload identity for deployed applications, or `az login` for development. To configure a service principal, supply all three of `tenantId`, `clientId` and `clientSecret`. Secrets decrypted by Webda remain wrapped until the SDK constructor needs their plain value. Clear-text secrets emit the existing `SecretString.from` warning, which names the field and never logs its value. Creating a credential performs no token request; the SDK acquires a token when a client needs one.

See Microsoft's [Azure Identity documentation](https://learn.microsoft.com/en-us/javascript/api/overview/azure/identity-readme?view=azure-node-latest) for the SDK's credential chain and environment variables.

## Resource contributions

Services implement `AzureContributor` to describe their ARM resources, container environment, outputs and managed-identity roles. Deployers merge the returned contribution and grant its roles to the application's managed identity.

```typescript
import type { AzureContributor, AzureDeployerInfo, AzureResourceContribution } from "@webda/azure";

class StorageContribution implements AzureContributor {
  getAzureResources(deployer: AzureDeployerInfo): AzureResourceContribution {
    const account = "myappstorage";
    const scope = `[resourceId('Microsoft.Storage/storageAccounts', '${account}')]`;
    return {
      resources: [
        {
          type: "Microsoft.Storage/storageAccounts",
          apiVersion: "2023-05-01",
          name: account,
          location: deployer.resources.location,
          tags: deployer.getDefaultTags(),
          sku: { name: "Standard_LRS" },
          kind: "StorageV2"
        }
      ],
      env: { STORAGE_ACCOUNT: account, STORAGE_KEY: { secretRef: "storage-key" } },
      outputs: { storageAccountId: { type: "string", value: scope } },
      roleAssignments: [
        {
          roleDefinitionId:
            "[subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')]",
          scope
        }
      ]
    };
  }
}
```

`AzureDeployerInfo` exposes `resources.resourceGroup`, `resources.location`, `resources.subscriptionId`, `getDefaultTags(tags?)` and `getAppPrincipalId()`. Contributors describe resources synchronously; the deployer performs Azure operations. Environment secrets use `{ secretRef }` references to secrets supplied by the deployer.

## Runtime services

Declare these services in `webda.config.jsonc`. All use the credentials above and create SDK clients during initialization.

```jsonc
{
  "services": {
    "Files": {
      "type": "Webda/AzureBlobBinary",
      "account": "myappstorage",
      "container": "files",
      "models": { "MyApp/Document": ["attachments"] }
    },
    "Database": {
      "type": "Webda/CosmosStore",
      "endpoint": "https://myapp.documents.azure.com",
      "database": "webda",
      "container": "models",
      "models": ["MyApp/Document"]
    },
    "Work": { "type": "Webda/ServiceBusQueue", "namespace": "myapp.servicebus.windows.net", "queue": "work" },
    "Events": {
      "type": "Webda/ServiceBusPubSub",
      "namespace": "myapp.servicebus.windows.net",
      "topic": "events",
      "subscription": "api"
    },
    "Vault": { "type": "Webda/AzureKeyVault", "vaultUrl": "https://myapp.vault.azure.net" }
  }
}
```

### Blob binaries and content

`AzureBlobBinary` implements `CloudBinary` and registers `azure://container/key` and `azblob://container/key` content URLs. `getContent`, `putContent`, `headContent` and `deleteContent` support streaming, byte ranges, metadata and conditional creation. `prefix` scopes binary keys. `connectionString` accepts a `SecretString`; `endpoint` overrides the configured storage endpoint. `createContainer` defaults to `false`.

Files use `<prefix>/<md5>/data` and exact model/attribute/owner markers. A direct upload has three steps:

1. Send the normal binary challenge (`hash`, `challenge`, `size`, name and MIME type). A verified matching proof attaches an existing file immediately.
2. PUT bytes to the returned SAS URL with **all returned headers**, including `x-ms-blob-type: BlockBlob` and `Content-MD5`. This SAS only creates an isolated staging blob; it cannot replace shared content.
3. POST the binary's `complete/{hash}` action. Webda checks the staged bytes, size and proof before publishing and attaching the file. An unfinished or invalid upload never grants access to existing data.

SAS URLs use a shared key when the connection string contains one, or an Entra user delegation key otherwise. The contributor grants Blob Data Contributor on the container and Blob Delegator on the account for signing. Signed URLs and proof values are never logged. `urlExpiry` controls SAS lifetime; `pendingTimeout` limits completion time. Configure a storage lifecycle policy to expire `_staging/` and `_pending/` objects older than that timeout, allowing for the SAS lifetime.

For Azurite, use `connectionString: "UseDevelopmentStorage=true"`, `createContainer: true`, and `serviceVersion: "2023-11-03"` when its supported API version predates the SDK. Development connection strings may also provide a `BlobEndpoint`. Keep the container private.

### Cosmos DB

`CosmosStore` uses the NoSQL API and a serializer envelope to preserve dates, behaviors and concrete model types. `key` accepts a `SecretString`; without it the SDK uses Entra authentication. `createIfNotExists` defaults to `false`; `throughput` optionally configures container RU/s when creating it.

The default partition key is `/id`, with the model primary key encoded as a Cosmos-safe identifier. A custom partition such as `/tenant` must be a top-level field included in the model's primary key. It is immutable with that key. A container's partition definition must match the service setting.

Replace, delete and patches use ETags; stale conditions raise `UpdateConditionFailError`, and missing records raise `StoreNotFoundError`. Patch, increment and remove operations use atomic Cosmos Patch. A change requiring more than ten patch operations fails before writing; use `update()` for larger replacements. Concurrent writes can surface an ETag conflict for the caller to retry.

Supported WebdaQL filters are `=`, `!=`, `<`, `<=`, `>`, `>=`, `IN`, array `CONTAINS`, `LIKE`, `IS NULL`, `IS NOT NULL`, and nested `AND`/`OR`, plus `ORDER BY`, parameters, page limits and opaque continuation tokens. Query values are bound parameters. Cosmos composite indexes may be required for multi-field ordering. Aggregation uses the repository fallback policy; bulk UPDATE and DELETE are explicitly unsupported.

The resource contributor creates the SQL database/container under the account named by `endpoint` and assigns the **Cosmos data-plane** Built-in Data Contributor role. Provision the account itself separately or through the deployer's `customResources`.

### Service Bus

Both services accept `namespace`, optional `connectionString` (`SecretString`), and `createIfNotExists` (default `false`). Queue settings include `queue`, `maxMessages` (10), `maxWaitTimeInMs` (1000), and `maxPendingMessages` (1000).

`ServiceBusQueue` receives in peek-lock mode. Each opaque receipt retains the exact SDK message; `deleteMessage(receipt)` completes it. Failed processing leaves the message available after lock expiry. The pending receipt map is bounded and expired receipts are removed on subsequent receives. Size reports active messages. Long-running manual consumers must finish within the configured Service Bus lock duration.

`ServiceBusPubSub` publishes JSON to `topic`. A configured `subscription` is shared and is never deleted by shutdown. Omitting it creates a unique temporary subscription per consumer with five-minute idle expiry. Successful callbacks complete messages; failed callbacks abandon them. Cancellation waits for receiver creation and closes it, then deletes only its own temporary subscription.

Contributors create messaging entities in an existing namespace and grant Data Sender/Data Receiver. Temporary subscriptions also need topic-scoped Data Owner for their management operations. Runtime `createIfNotExists` needs management privileges; production deployments normally create entities through ARM instead.

### Key Vault configuration and encryption

`AzureKeyVault.getSecret(name)` returns a masked `SecretString`. To load a JSON configuration document, configure `ConfigurationService.sources` as `["Vault:configuration-secret"]`. Within that document, a whole value such as `"${keyvault:database-password}"` resolves to the named secret. Embedded string interpolation is deliberately not supported, so secret wrappers remain intact. ConfigurationService polls for changes.

The module registers the `azure` configuration encrypter before services are created:

```jsonc
{
  "parameters": {
    "configurationEncryption": {
      "default": "azure",
      "encrypters": { "azure": { "keyId": "https://myapp.vault.azure.net/keys/configuration" } }
    }
  },
  "services": { "Database": { "key": "encrypt:azure:replace-this" } }
}
```

Run `webda config encrypt` to replace the marker with an `crypt:azure:` value. `WEBDA_AZURE_KEY_ID` is the fallback key URL. A random AES-256-GCM key encrypts the value locally and Key Vault wraps that key with RSA-OAEP-256. The envelope pins the vault key version, and tampered values fail authentication. Keep previous key versions enabled while their envelopes remain in use. Decrypted service values stay wrapped until the SDK needs them. The contributor grants Key Vault Secrets User and Crypto User on an existing vault.

### Monitor logs and OpenTelemetry

Container Apps already forwards stdout to Log Analytics. `AzureMonitorLogger` is optional when a custom table is needed:

```json
{
  "type": "Webda/AzureMonitorLogger",
  "endpoint": "https://my-dce.ingest.monitor.azure.com",
  "ruleId": "dcr-immutable-id",
  "streamName": "Custom-Webda",
  "logLevel": "INFO",
  "batchSize": 100,
  "flushInterval": 5000,
  "maxBufferedLogs": 10000
}
```

Follow Microsoft's [Logs ingestion setup](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/tutorial-logs-ingestion-portal) to create a Log Analytics custom table, a DCR and (when needed) a DCE. Use the DCR's **immutable** ID, its ingestion stream name, and the DCE or direct DCR ingestion endpoint. Grant the application identity **Monitoring Metrics Publisher** on the DCR. The stream and target table need these columns:

```json
[
  { "name": "TimeGenerated", "type": "datetime" },
  { "name": "Level", "type": "string" },
  { "name": "Message", "type": "string" }
]
```

The logger filters levels, sends serial batches, retains failed records for retry and flushes on stop. Its bounded buffer drops new records when full (`droppedLogs` records the count). Delivery is at least once; retries can duplicate records. `lastDeliveryFailed` is available for health checks, and a failed final flush raises an error after listeners are detached.

For traces and metrics, reuse `@webda/otel` and an OTLP collector with Azure Monitor ingestion. The current Webda OTEL service selects console or OTLP exporters; it does not accept an Azure exporter instance in its configuration. A separately configured Azure Monitor OpenTelemetry SDK/exporter is another option, but avoid initializing competing global SDKs. See Microsoft's [Azure Monitor OpenTelemetry options](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/opentelemetry-options). This package adds no second tracing or metrics implementation.

## Deployers

`Webda/AzureContainerAppsDeployer` builds an OCI image and deploys its digest with ARM. `Webda/AzureFunctionsPackager` creates a deterministic Functions archive, and `Webda/AzureFunctionsDeployer` deploys it to Node 22 Flex Consumption through OneDeploy. See the [Azure deployment guide](https://webda.io/docs/Deployments/Azure).

## Emulator tests

The `Azure emulators` workflow runs Blob uploads against Azurite and Cosmos repository conformance against the Linux emulator. Unit tests use SDK mocks and need no cloud credentials. To run the emulator tests locally, start their containers, trust the Cosmos emulator certificate with `NODE_EXTRA_CA_CERTS`, then run:

```sh
AZURE_EMULATOR_TESTS=true pnpm --filter @webda/azure exec vitest run src/services/emulators.spec.ts --coverage.enabled=false
```

Only that test process trusts the emulator certificate; TLS verification remains enabled. The documented emulator account keys are development credentials only.

## Validation

```sh
pnpm --filter @webda/azure build
pnpm --filter @webda/azure test
pnpm --filter @webda/azure lint
pnpm --filter @webda/azure format
```

<!-- README_FOOTER -->

## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://webda.io/img/sponsors/arize.svg" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://webda.io/img/sponsors/loopingz.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://webda.io/img/sponsors/tellae.svg" width="200">](https://tellae.fr)
