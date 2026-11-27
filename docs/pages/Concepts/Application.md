---
sidebar_position: 1
---

# Application

An `Application` holds the known model and service types and loads the Webda configuration.
A packaged application reads cached module metadata instead of scanning installed packages.
The core runtime uses this configuration and type registry to create and start services.

Configuration templates allow values to be resolved dynamically.

## UnpackedApplication

The UnpackedApplication has all the module resolution enabled: it scans `node_modules` for `webda.module.json` files and loads the package descriptions, instead of reading them from the cachedModule.

Compiling your application and generating the `webda.module.json` is done by `webdac build` (`@webda/compiler`).

## TestApplication

Similar to UnpackedApplication with additional test services prebuilt

## See also

- [Core Architecture](../Modules/core/Architecture.md)
- [Core CLI](../Modules/core/CLI.md)
- [Core Service Lifecycle](../Modules/core/Lifecycle.md)
