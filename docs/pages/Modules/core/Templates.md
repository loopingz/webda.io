---
sidebar_position: 15
sidebar_label: Templates
---

# TemplateService

`TemplateService` provides template rendering with pluggable template engines (`mustache` included by default). It supports template caching, multi-folder search priority, locale fallbacks, and multi-part template rendering (e.g. `subject`, `html`, `text` for emails).

## Features

- **Pluggable Engines**: Stateless `TemplateEngine` plugins registered via `TemplateService.registerEngine(name, engine)`.
- **Default Engine**: Mustache engine is registered by default.
- **Multi-Part & Single Templates**: Supports single template files (e.g. `welcome.mustache`) or folder-based multi-part templates (e.g. `PASSPORT_EMAIL_RECOVERY/{subject,html,text}.mustache`).
- **Locale Fallbacks**: Searches `locale` (e.g. `fr-FR`) &rarr; `language` (`fr`) &rarr; default application locale &rarr; base template.
- **Folder Priority**: Evaluates `folders` in order (first match wins), allowing application templates to override module defaults.
- **Partials**: Automatically loads partials starting with `_` or in a `partials/` subdirectory.
- **Default Service**: Registered by default in the application as `TemplateService`.

## Configuration

In `webda.config.jsonc`:

```jsonc
{
  "services": {
    "TemplateService": {
      "type": "Webda/TemplateService",
      "folders": ["./templates", "./node_modules/@webda/auth/templates"],
      "engine": "mustache",
      "cache": true
    }
  }
}
```

### Parameters

| Field | Type | Default | Description |
|---|---|---|---|
| `folders` | `string[]` | `["./templates"]` | Folders to search, in priority order (first match wins) |
| `engine` | `string` | `"mustache"` | Preferred engine when multiple match |
| `engines` | `Record<string, any>` | `{}` | Options passed to `engine.configure(options)` |
| `cache` | `boolean` | `true` | Cache compiled templates in memory |

## Usage

```typescript
import { useService, TemplateService } from "@webda/core";

const templates = useService("TemplateService");

// 1. Render an inline template string
const greeting = await templates.renderString("Hello {{name}}!", { name: "Alice" });

// 2. Render a single template
const welcome = await templates.render("welcome", { name: "Alice" }, { locale: "fr-FR" });

// 3. Render a specific part of a multi-part template
const subject = await templates.render("PASSPORT_EMAIL_RECOVERY/subject", { name: "Alice" });

// 4. Render all parts of a multi-part template
const parts = await templates.renderAll("PASSPORT_EMAIL_RECOVERY", {
  url: "https://example.com/reset"
}, { locale: "fr-FR" });
// Result: { subject: "...", html: "...", text: "..." }
```

## Creating Custom Engines

Implement the `TemplateEngine` interface and register it:

```typescript
import { TemplateService, TemplateEngine, TemplateRenderOptions } from "@webda/core";

export const handlebarsEngine: TemplateEngine = {
  extensions: ["hbs", "handlebars"],
  configure(options) {
    // Optional configuration
  },
  compile(source: string, options?: TemplateRenderOptions) {
    const template = Handlebars.compile(source);
    return (data: any) => template(data);
  }
};

TemplateService.registerEngine("handlebars", handlebarsEngine);
```
