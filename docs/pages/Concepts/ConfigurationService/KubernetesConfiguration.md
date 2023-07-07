# Kubernetes Configuration Service

This service will load and hot reload configuration from a `ConfigMap` or `Secret` in Kubernetes.

The usual flow is to use `FileConfigurationService` in dev, and then switch it for the `KubernetesConfigurationService` in production.

You have to configure the folder when the secret will be mounted

```
"kubernetes": {
    "source": "/secrets"
}
```

The service will take the first of `webda.jsonc?` or `webda.yaml` as configuration

To create the secret from your `local.config.jsonc` you can use the following command

```bash
kubectl create secret generic my-secret-name --from-file=webda.jsonc=local.config.jsonc
```
