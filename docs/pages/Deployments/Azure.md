# Azure

Install `@webda/azure` and declare an Azure unit in a deployment file. Azure units reuse Webda's application packager and ARM resource contributors. Runtime services are documented in the [Azure module](../Modules/azure/README.md).

## Container Apps

```json title="deployments/azure.json"
{
  "units": [
    {
      "name": "Api",
      "type": "Webda/AzureContainerAppsDeployer",
      "registry": "myacr",
      "resourceGroup": "my-app-${deployment}",
      "subscriptionId": "${env.AZURE_SUBSCRIPTION_ID}",
      "location": "westeurope",
      "createResourceGroup": true,
      "containerApp": {
        "minReplicas": 1,
        "env": { "DB_PASSWORD": { "secretRef": "database-password" } }
      },
      "secrets": { "database-password": "${env.DB_PASSWORD}" },
      "templateOutput": "dist/azure-template.json"
    }
  ]
}
```

```sh
webda -d azure azure template --output dist/review.json
webda -d azure container build
webda -d azure deploy
```

`azure template` performs no build, push or Azure deployment. It uses the first image tag for review. `deploy` builds with `@webda/oci`, pushes the image and deploys its immutable digest. Its result contains `image`, `digest`, `fqdn`, `revision` and ARM outputs. `templateOutput` records the exact deployed template, with secret values represented by secure parameter references.

| Parameter                                  | Default                                | Behavior                                                                                                                      |
| ------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `resourceGroup`                            | required                               | ARM deployment scope                                                                                                          |
| `subscriptionId`                           | `AZURE_SUBSCRIPTION_ID`                | Target subscription                                                                                                           |
| `location`                                 | `westeurope`                           | Resource region                                                                                                               |
| `createResourceGroup`                      | `false`                                | Create/update the resource group                                                                                              |
| `image`                                    | `<registry>.azurecr.io/<package-name>` | OCI repository; required without `registry`                                                                                   |
| `registryAuth`                             | `aad`                                  | ACR token exchange for publishing; `identity` uses existing OCI publishing credentials; `none` also omits pull authentication |
| `containerApp.name`                        | normalized unit name                   | Container App name, 2–32 characters                                                                                           |
| `containerApp.cpu` / `memory`              | `0.5` / `1Gi`                          | Container resources                                                                                                           |
| `containerApp.minReplicas` / `maxReplicas` | `0` / `10`                             | Replica limits                                                                                                                |
| `containerApp.ingress`                     | external HTTP, port 18080              | Set `false` for workers                                                                                                       |
| `containerApp.env`                         | `{}`                                   | Explicit values override contributed environment variables                                                                    |
| `containerApp.probes` / `scaleRules`       | omitted                                | Native Container Apps probes and KEDA scale rules                                                                             |
| `environment.name`                         | `<resourceGroup>-env`                  | Managed environment                                                                                                           |
| `environment.id`                           | omitted                                | Reuse an environment and skip its creation and Log Analytics                                                                  |
| `logAnalytics`                             | `{}`                                   | Workspace name/retention overrides; `false` disables workspace creation                                                       |
| `resourceTags`                             | deployment and git version             | Azure resource tags; OCI `tags` remain image tags                                                                             |
| `secrets`                                  | `{}`                                   | String, `SecretString`, or `{keyVaultUrl, identity}` per secret                                                               |
| `crons`                                    | `true`                                 | Export declared cron methods as scheduled jobs                                                                                |
| `customResources`                          | `[]`                                   | Additional ARM resource objects, or a named map of them                                                                       |
| `deploymentName`                           | unit name and timestamp                | ARM deployment history name                                                                                                   |

Inherited OCI options include `baseImage`, `tags`, `platforms`, `package`, `credentials`, image environment and entrypoint settings. Pin the base image digest for reproducible releases. The deployer leaves the image command and entrypoint intact; jobs supply `cron run --id <export-id>` arguments. Container Apps accepts five cron fields, or a six-field Webda expression whose seconds field is `0`; sub-minute schedules fail validation.

The deployer creates a user-assigned identity before image pull permissions are needed. The app and its jobs share this identity, and the runtime receives its client ID through `AZURE_CLIENT_ID`. Their system-assigned identities are also enabled. Azure contributors grant data access to the shared identity, so scheduled jobs receive the same permissions as HTTP handlers. ACR must already exist, and the deployment identity needs permission to publish images and create role assignments.

### Custom domains

`customDomains` accepts `{name, certificateId?, bindingType?, validationMethod?}`. With a certificate ID, the app binds it directly. Without one, deployment first registers the hostname without TLS binding, creates a managed certificate, and then binds it through a nested ARM deployment. `validationMethod` defaults to `CNAME`; use `HTTP` for apex domains. Managed certificates keep at least one replica running and require public HTTP ingress.

Create the required DNS records before deploying the certificate. For the first deployment, deploy without `customDomains` to discover the app hostname and verification records, configure DNS, then add the domain. See Microsoft's [managed certificate requirements](https://learn.microsoft.com/en-us/azure/container-apps/custom-domains-managed-certificates). An existing environment must be in the deployment resource group for managed certificate creation; supply an existing certificate ID for other scopes.

### Worker scaling

For Service Bus workers, use `containerApp.ingress: false` and a native KEDA rule in `containerApp.scaleRules`, for example an `azure-servicebus` custom rule with the namespace, queue name and message count. Configure that rule's identity/authentication according to the Azure Container Apps API. Service permissions contributed by `ServiceBusQueue` cover send/receive access; scaler metadata is explicit deployment configuration.

## Functions Flex Consumption

```json title="deployments/functions.json"
{
  "units": [
    {
      "name": "Functions",
      "type": "Webda/AzureFunctionsDeployer",
      "resourceGroup": "my-app-functions",
      "createResourceGroup": true,
      "functionApp": "my-unique-webda-functions",
      "storageAccount": "myuniquefunctionstorage",
      "location": "westeurope",
      "appSettings": { "DATABASE_PASSWORD": "encrypt:azure:replace-this" }
    }
  ]
}
```

```sh
webda -d functions azure package
webda -d functions azure template --output dist/functions-arm.json
webda -d functions deploy
```

The archive contains the packaged application and production dependencies, a `host.json`, and a Node v4 bootstrap registering Webda's catch-all HTTP handler. Existing `local.settings.json` files are excluded. Webda cron annotations become NCRONTAB timer triggers. Additional Service Bus queue, Blob and timer bindings can be declared in `triggers`; their events are dispatched to DI services implementing `AzureEventsHandler`. Exceptions propagate to the host's retry policy when an event cannot be handled.

The HTTP adapter preserves headers, status, cookies and binary bytes. It boots the packaged application once per worker and runs concurrent invocations in Webda's request contexts. It also installs `AzureFunctionServer` in the packaged configuration when absent. `AzureFunctionsPackager` can be used as a packaging-only deployment unit.

The deployer creates an FC1 Linux plan, storage account, deployment container and function app with Node 22 runtime settings. `memory` defaults to 2048 MB (512/2048/4096 supported); `maximumInstanceCount` defaults to 100 (40–1000). `plan`, `zipPath`, `package`, `triggers`, `appSettings`, `resourceTags`, `customResources` and the common Azure credentials are configurable.

Storage access uses the app's shared user-assigned identity, including deployment storage and `AzureWebJobsStorage`. Explicit secret app settings use `SecretString` secure parameters; Key Vault app setting references can also be supplied as strings. The finished archive is uploaded through Flex Consumption **OneDeploy** at `/api/publish?type=zip&remoteBuild=false`, with ARM bearer authentication and bounded status polling. It does not run a remote package install. See Microsoft's [Functions deployment technologies](https://learn.microsoft.com/en-us/azure/azure-functions/functions-deployment-technologies).

## Authentication and permissions

For local deployment, run `az login` and set `AZURE_SUBSCRIPTION_ID`. For CI, prefer a federated identity:

```yaml
permissions:
  id-token: write
  contents: read
steps:
  - uses: azure/login@v2
    with:
      client-id: ${{ secrets.AZURE_CLIENT_ID }}
      tenant-id: ${{ secrets.AZURE_TENANT_ID }}
      subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
  - run: pnpm exec webda -d azure deploy
    env:
      AZURE_SUBSCRIPTION_ID: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
```

`DefaultAzureCredential` reuses that login. A complete `tenantId`, `clientId`, `clientSecret` triple selects a service principal instead. The deploying identity needs ARM write permissions and role-assignment management; runtime identities receive the narrower service roles contributed by the application. Resource group creation, role propagation, registry access, DNS validation and region support are Azure deployment prerequisites. Template and SDK unit tests run without provisioning Azure resources.
