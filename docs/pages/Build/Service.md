# Build a service

Use services for external integrations, shared infrastructure, and orchestration that spans models.
Keep entity-specific rules in [models](./Model.md).

## Define and configure a service

Start with [My First Service](../QuickStart/FirstService.md), then use the
[service reference](../Modules/core/Services.md) for the base class, configuration parameters,
registration, and dependency injection. Let the framework resolve dependencies and manage service instances.

## Manage startup and shutdown

Follow the [service lifecycle](../Modules/core/Lifecycle.md) when resolving dependencies, initializing resources,
and closing them. Make resource cleanup part of the implementation rather than leaving it to process termination.

## Coordinate and observe work

Use [events](../Modules/core/Events.md) when components need to react to changes,
[logging](../Modules/core/Logging.md) to explain runtime behavior, and
[typed errors](../Modules/core/Errors.md) to report failures consistently.

## Expose and test behavior

Expose service operations through the appropriate [interface](../Expose/index.md), or provide local
[CLI commands](../Expose/CLI.md#service-commands-with-command) for administrative work.
Use the [application test harness](../Modules/test/README.md) to exercise services with explicit test configuration
and controlled dependencies.
