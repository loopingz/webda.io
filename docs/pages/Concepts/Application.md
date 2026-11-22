---
sidebar_position: 1
---

# Application

An Application represent the known types and load webda configuration.
It load the right files based on a predefined cachedModule definition

It also include some templating mechanism to allow dynamic object/string.

## UnpackedApplication

The UnpackedApplication has all the module resolution enabled: it scans `node_modules` for `webda.module.json` files and loads the package descriptions, instead of reading them from the cachedModule.

Compiling your application and generating the `webda.module.json` is done by `webdac build` (`@webda/compiler`).

## TestApplication

Similar to UnpackedApplication with additional test services prebuilt

## See also

- [Core Architecture](../Modules/core/Architecture.md)
- [Core CLI](../Modules/core/CLI.md)
- [Core Service Lifecycle](../Modules/core/Lifecycle.md)
