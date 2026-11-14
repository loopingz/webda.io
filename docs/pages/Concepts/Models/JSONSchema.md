To ignore a field from your class you can use JSDocs Tags

`@SchemaIgnore`

To choose how the text of an attribute sent by a client is sanitized, tag it

`@sanitize <mode>`

with `text` (the default: tags removed, entities escaped), `none` (kept as sent), `html` (rich text, allowlist of formatting tags) or `markdown` (Markdown source, without raw HTML nor unsafe link schemes). It adds `"x-webda-sanitize": "<mode>"` to the property. The `markdown` mode needs `pnpm add micromark micromark-util-decode-string` in the application: the build fails without them. See [Text sanitization](../../Modules/models/Defining-Models.md#text-sanitization--sanitize).
