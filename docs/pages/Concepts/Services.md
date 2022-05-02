# Services

## Bean

When you create a service and declare @Route annotation, the service becomes a Bean, it won't be reusable

## Lifecycle

The service will be created based on webda.config definition

```mermaid
graph TD
    sync constructor
        loadParameters
    sync resolve
        dependencies injected
        computeParameters
        initRoutes
    async init
```

## Generic Parameters

A Service is a generic class that has at least 2 Parameters:

```
Service<T extends ServiceParameters,E extends Events>

T: Define the class that define and load the parameters from the configuration
E: Define the events and their types that the service emits
```

## Dependencies

### @Inject

You can use @Inject to retrieve another Service

