---
sidebar_label: "@webda/templates"
---
# templates

`@webda/templates` renders templates found in folders, with a pluggable engine registry, locale fallback and partials. The `TemplateService` (`Webda/TemplateService`) exposes it to other services, such as the mailer.

## Configuration

```jsonc
{
  "services": {
    "TemplateService": {
      "type": "Webda/TemplateService",
      "folders": ["./templates"],
      "engine": "mustache",
      "engines": { "mustache": {} },
      "cache": true
    }
  }
}
```

| Parameter | Default | Description |
| --- | --- | --- |
| `folders` | `["./templates"]` | Folders to look templates into, in priority order. A missing folder logs a `WARN` at init |
| `engine` | `"mustache"` | Engine winning when several engines handle the same file extension |
| `engines` | `{}` | Options per engine name, passed to the engine `configure` during `resolve()` |
| `cache` | `true` | Cache compiled templates. Always disabled when the application runs in debug mode |

## Lookup layout

A template is either a single file or a folder of parts (for example the subject, html and text of an email).

```
templates/
├── partials/               # global partials, available to every template
│   └── footer.mustache
├── single.mustache         # NAME
├── single.fr.mustache      # NAME.<locale>
├── WELCOME/                # multi-part template: NAME/<part>
│   ├── subject.mustache
│   ├── html.mustache
│   ├── text.mustache
│   ├── _signature.mustache # local partial, used as {{>signature}}
│   └── fr/                 # NAME/<locale>/<part>
│       └── subject.mustache
```

```typescript
const templates = useService("TemplateService");
await templates.render("single", { name: "Bob" }); // single template
await templates.render("WELCOME/html", { name: "Bob" }); // one part
await templates.renderAll("WELCOME", { name: "Bob" }, { locale: "fr" }); // { subject, html, text }
await templates.renderString("Hello {{name}}", { name: "Bob" }); // inline source
```

Folders are searched in order, the first folder with a match wins. Template names cannot contain `..` or start with `/`.

Multi-part templates can be nested in subfolders: `renderAll("auth/WELCOME")` and `has("auth/WELCOME")` use the `auth/WELCOME/` folder parts, `render("auth/WELCOME/html")` renders one of them.

## Locale

For `{ locale: "fr-CA" }` the lookup tries, most specific first: `fr-CA`, `fr`, the application default locale (first of the core locales), then the template without locale. An empty locale, or one not matching `[A-Za-z0-9_-]+`, is the same as no locale. Each part of a multi-part template falls back on its own.

## Partials

- Files in `<folder>/partials/` are global partials: `partials/footer.mustache` is `{{>footer}}`.
- In a multi-part folder, files starting with `_` are local partials: `WELCOME/_signature.mustache` is `{{>signature}}`. Local partials win over global ones. A part found in a locale subfolder (`WELCOME/fr/subject.mustache`) also sees the `_` files of `WELCOME/fr/`, which win over the `WELCOME/` ones on a name clash.

## Custom engine

Register an engine from a Modda file or any module loaded at startup:

```typescript
import { TemplateService } from "@webda/templates";

TemplateService.registerEngine("handlebars", {
  extensions: ["hbs"],
  configure: options => {
    // `engines.handlebars` of the service configuration
  },
  compile: source => {
    const compiled = Handlebars.compile(source);
    return (data, options) => compiled(data, { partials: options?.partials });
  }
});
```

The engine is then selected by file extension (`welcome.hbs`), or forced with the `engine` parameter when several engines share an extension.

Engines based on modules, such as a TSX component, can implement the optional `load(path, options)` hook. When present it is called instead of reading the file and calling `compile`, so the engine can `import()` the file itself.

## Metrics

- `template_render` (counter, label `engine`): number of renders
- `template_errors` (counter): number of renders in error
