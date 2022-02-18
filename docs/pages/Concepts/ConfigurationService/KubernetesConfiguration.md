# Kubernetes Configuration Service

This service map a `SecretMap` or a `ConfigMap` to a JSON object

Each key/value equals to the root of a branch

If the key ends with '.yaml' or '.json' it will be parsed, otherwise the full content is returned
