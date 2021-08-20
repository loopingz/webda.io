# webda.config.json

This is the application definition file

It has 2 main sections:

```json
{
  "parameters": {
    // This will be passed to all your Services and can contain common parameters
  },
  "services": {
    // Define each Service and its own parameters
  },
  "version": "2"
}
```

## Parameters

Each service will be injected with its parameters.

## Services

This is a map with all Services name. If the `type` is not defined, then it will default
to `type = name`, and add default namespace if it does not have a namespace.
