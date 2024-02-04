---
sidebar_position: 1
---

# Application

An Application represent the known types and load webda configuration.
It load the right files based on a predefined cachedModule definition

It also include some templating mechanism to allow dynamic object/string.

## SourceApplication

The SourceApplication have all the module resolution enabled.

It can compile your typescript application, generate documentation, generate openapi, and generate the cachedModule needed for the `Application`

## TestApplication

Similar to SourceApplication with additional test services prebuilt
