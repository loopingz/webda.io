# @webda/templates

Template engine registry and rendering helpers for Webda. Ships a `mustache` engine; other engines register
themselves with `registerTemplateEngine(name, engine)`.

## Multi-part files

An engine defining `parts(path, options?): Promise<string[]>` is multi-part: one file provides several parts (for example `html`, `subject` and `text`). The renderer lists them with `parts()` and calls `load(path, { ...options, part })` for each one, with no `partials`.

For a part `NAME/part`, per locale candidate, the lookup order is:

1. the part files (`NAME/[locale/]part.<ext>`, multi-part extensions excluded),
2. `NAME/[locale/]email.<ext>`,
3. `NAME[.locale].<ext>`.

The multi-part file is used only when `parts()` lists the requested part. A `NAME.<ext>` is also a single template, loaded with `part: undefined`. Other files with a multi-part extension next to `email.<ext>` (layouts, `_footer`...) are never parts.

See `@webda/react-email` for an engine that exposes a `.tsx` file this way.
