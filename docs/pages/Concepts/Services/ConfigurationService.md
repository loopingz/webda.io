# Configuration Service

ConfigurationService refreshes application parameters from files, configuration stores, or secret providers. It applies an update only when the configuration changes.

## When to use it

Use dynamic configuration for values that can change while the application runs, such as feature settings or integration parameters. Service types remain fixed.

## Before you begin

Start with a [configured service](../../QuickStart/FirstService.md) and choose a configuration provider from the list below.

## Configuration values

```json title="local.config.json"
{
  "parameters": {
    "param2": "test"
  },
  "services": {
    "MyService": {
      "param1": "dynamic"
    }
  }
}
```

The `parameters` section supplies shared values; `services` supplies values for individual services.

:::warning Service types stay fixed
Configuration updates cannot change an existing service into another type. Treat route definitions as application code rather than dynamic configuration.
:::

## Dynamic updates

import ConfigurationFlow from "@site/src/components/ConfigurationFlow";

<ConfigurationFlow />

Sources are read and merged in their configured order, starting from the defaults. A provider notification or the polling interval triggers a refresh. If the merged configuration differs from the previous value, encrypted values are decrypted and passed to Core. Core updates changed service parameters while preserving service types.

## Existing Configuration Provider

- `FileConfiguration` loads configuration from a file.
- [KubernetesConfiguration](../../Modules/kubernetes/KubernetesConfiguration.md) loads Kubernetes Secrets or ConfigMaps.
- AWS Secrets Manager (`@webda/aws`) and Azure Key Vault (`@webda/azure`)

## Encrypted values

The configuration returned by the sources can contain encrypted values (`crypt:<encrypter>:<data>`): they are
decrypted before being applied, like in `webda.config.jsonc`. See [Configuration Secrets](../../Security/ConfigurationSecrets.md).

## Next steps

- [Protect configuration secrets](../../Security/ConfigurationSecrets.md).
- [Mount Kubernetes configuration](../../Modules/kubernetes/KubernetesConfiguration.md).
- [Understand service startup and shutdown](./Services.md#lifecycle).
