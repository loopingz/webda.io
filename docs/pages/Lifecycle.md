# Lifecycle

- `Application` is created (`new Application()` / `new UnpackedApplication()`) and loaded (`await application.load()`):
    - Load `webda.config.json` (in `UnpackedApplication`, merge `webda.module.json` files if `cachedModules` is not set)
    - Apply deployment override (`applyCurrentDeployment()`) if any
    - Load `webda.module.json` (`loadModule()`)
    - In `UnpackedApplication`, ensure default configuration (`ensureDefaultConfiguration()`)
- `Core` is created (`new Core(application)`) and initialized (`await core.init()`, which calls `await core.resolve()`):
    - `new Core(application)` loads modda classes, computes service configurations, and identifies `configurationService` (no services are created yet)
    - `Core.resolve()`:
        - Decrypt configuration and register beans
        - If `ConfigurationService` is configured, create, resolve, and immediately initialize it (`bootstrap` -> `resolve` -> `init`) before other services
        - Create and resolve each remaining service on first use (`getService()`), dependencies first (`@Inject` fields are populated during the service's own `resolve()`)
        - Sort init order: `Store` services first, then other services in creation order, then defaults (logged at `DEBUG` as `Services init order`)
    - `Core.init()`:
        - Initialize services sequentially in `initOrders`
        - Emit `Webda.Init.Services` with `this.services`
- `Core.stop()`:
    - Cancel interruptables and stop all services concurrently via `Promise.all`

## Service

When creating a `Service`, define its parameters:

- `resolve()`: synchronous; called immediately when the service is instantiated (`getService()`), with `@Inject` dependencies already populated. Validate `this.parameters` here if needed.
- `init()`: asynchronous; called in `initOrders` (stores first, then other services). Open connections and start background work here.



## Future

 - MultiConfiguration service: to allow load secrets from secrets and config from configmap
 