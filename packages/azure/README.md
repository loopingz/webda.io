# @webda/azure module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

Azure authentication and resource contribution contracts shared by Webda services and deployers.

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

| Parameter | Environment fallback | Purpose |
| --- | --- | --- |
| `tenantId` | `AZURE_TENANT_ID` | Microsoft Entra tenant |
| `clientId` | `AZURE_CLIENT_ID` | Service principal or user-assigned identity client |
| `clientSecret` | `AZURE_CLIENT_SECRET` | Service principal secret (`string` or `SecretString`) |
| `subscriptionId` | `AZURE_SUBSCRIPTION_ID` | Resource subscription |
| `endpoint` | — | Service-specific endpoint, such as Azurite |

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
      resources: [{
        type: "Microsoft.Storage/storageAccounts",
        apiVersion: "2023-05-01",
        name: account,
        location: deployer.resources.location,
        tags: deployer.getDefaultTags(),
        sku: { name: "Standard_LRS" },
        kind: "StorageV2"
      }],
      env: { STORAGE_ACCOUNT: account, STORAGE_KEY: { secretRef: "storage-key" } },
      outputs: { storageAccountId: { type: "string", value: scope } },
      roleAssignments: [{
        roleDefinitionId: "[subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')]",
        scope
      }]
    };
  }
}
```

`AzureDeployerInfo` exposes `resources.resourceGroup`, `resources.location`, `resources.subscriptionId`, `getDefaultTags(tags?)` and `getAppPrincipalId()`. Contributors describe resources synchronously; the deployer performs Azure operations. Environment secrets use `{ secretRef }` references to secrets supplied by the deployer.

This foundation supports the Azure service and Container Apps deployer work tracked in [#863–#868](https://github.com/loopingz/webda.io/issues/863) and [#6](https://github.com/loopingz/webda.io/issues/6).

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
