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

## Dependencies

### @Inject

You can use @Inject to retrieve another Service
