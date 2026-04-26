---
sidebar_position: 4
sidebar_label: Module Manifest
---

# Module Manifest — `webda.module.json`

The `webda.module.json` file is the central artifact produced by `webdac build`. It is the runtime registry that tells Webda which models, services, deployers, and schemas are available in the application.

## When it is generated

`webda.module.json` is written by `webdac build` after TypeScript compilation. It is also merged with manifests from Webda framework packages installed in `node_modules`.

You **must commit `webda.module.json`** to source control. It is needed at runtime.

## File structure

```json
{
  "$schema": "https://webda.io/schemas/webda.module.v4.json",
  "beans": { ... },
  "moddas": { ... },
  "models": { ... },
  "deployers": { ... },
  "schemas": { ... }
}
```

| Section | Contents |
|---------|----------|
| `beans` | Singleton services (annotated with `@Bean` or `class extends Service`) that are auto-discovered |
| `moddas` | Named services that can be configured by type name in `webda.config.json` |
| `models` | Domain models (subclasses of `Model` / `UuidModel`) |
| `deployers` | Cloud deployer classes |
| `schemas` | Additional JSON Schemas referenced by the above sections |

## Section format

Each entry in `beans`, `moddas`, `models`, and `deployers` follows this shape:

```json
{
  "WebdaSample/Publisher": {
    "Import": "lib/services/publisher:Publisher",
    "Schema": { ... },
    "Configuration": "lib/services/publisher:PublisherParameters"
  }
}
```

| Field | Description |
|-------|-------------|
| `Import` | `<file-path-from-root>:<ExportedClassName>` — how to dynamically import the class at runtime |
| `Schema` | Inline JSON Schema (Draft-07) for the service parameters or model fields |
| `Configuration` | Optional: `<file>:<ParamsClass>` — the parameters class for this service |

## Real example — blog-system manifest (excerpt)

```json
{
  "$schema": "https://webda.io/schemas/webda.module.v4.json",
  "beans": {
    "WebdaSample/TestBean": {
      "Import": "lib/services/bean:TestBean",
      "Schema": {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "additionalProperties": false,
        "properties": {
          "service": {
            "enum": ["Registry", "CryptoService", "GraphQLService", "HttpServer", "..."],
            "type": "string"
          },
          "type": { "description": "Type of the service", "type": "string" }
        },
        "required": ["service", "type"],
        "type": "object",
        "title": "TestBean"
      },
      "Configuration": "lib/services/bean:TestBeanParameters"
    }
  },
  "moddas": {
    "WebdaSample/Publisher": {
      "Import": "lib/services/publisher:Publisher",
      "Schema": { ... },
      "Configuration": "lib/services/publisher:PublisherParameters"
    }
  },
  "models": {
    "WebdaSample/Post": {
      "Import": "lib/models/Post:Post",
      "Schema": { ... }
    },
    "WebdaSample/User": {
      "Import": "lib/models/User:User",
      "Schema": { ... }
    }
  },
  "deployers": {},
  "schemas": {}
}
```

## Model schemas in the manifest

Models have multiple schema views generated:

| View | When used |
|------|-----------|
| `input` (default, embedded) | Validates create/update API payloads |
| `output` | Validates response serialization |
| `stored` | Represents the on-disk/database format |

Each view is generated with `@webda/schema`'s `SchemaGenerator` using the `accessorMode` option.

## Dependency module merging

When `webdac build` runs, it walks up the `node_modules` tree looking for `webda.module.json` files in installed Webda packages. These are merged into the local manifest:

- `moddas`, `deployers`, `schemas` from dependencies are included
- `beans` from the **local application only** (dependencies' beans are not auto-registered)
- `capabilities` — project values override dependency values

This means you can use `type: "Webda/MemoryStore"` in your config and the `MemoryStore` class is found via the merged `moddas` section from `@webda/core`.

## Namespace

Every entry key in the manifest follows the pattern `<Namespace>/<Name>`:

```
WebdaSample/Post         ← application namespace "WebdaSample", model "Post"
Webda/MemoryStore        ← framework namespace "Webda", service "MemoryStore"
```

The namespace is set in `package.json`:

```json
{
  "webda": {
    "namespace": "WebdaSample"
  }
}
```

## Verify

```bash
# Build and inspect the manifest
cd sample-apps/blog-system
node ../../packages/compiler/lib/shell.js build

# View the manifest structure
cat webda.module.json | node -e "
const d = require('fs').readFileSync(0,'utf8');
const m = JSON.parse(d);
console.log('beans:', Object.keys(m.beans || {}));
console.log('moddas:', Object.keys(m.moddas || {}).slice(0, 5));
console.log('models:', Object.keys(m.models || {}));
"
```

Expected output:

```
beans: [ 'WebdaSample/TestBean' ]
moddas: [ 'WebdaSample/Publisher', 'Webda/HttpServer', 'Webda/Registry', 'Webda/CryptoService', 'Webda/SessionManager' ]
models: [ 'WebdaSample/Post', 'WebdaSample/User', 'WebdaSample/Comment', 'WebdaSample/Tag', 'WebdaSample/PostTag', 'WebdaSample/UserFollow' ]
```

## See also

- [Build](./Build.md) — `webdac build` produces this file
- [Code Generation](./CodeGen.md) — `webdac code` prepares source files before build
- [Plugins](./Plugins.md) — extending the manifest generation pipeline
- [@webda/schema JSON Schema](../schema/JSON-Schema.md) — how model schemas are generated
