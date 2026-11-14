To ignore a field from your class you can use JSDocs Tags

`@SchemaIgnore`

To keep a text attribute as the client sent it, instead of HTML-sanitizing it, tag it

`@sanitize none`

It adds `"x-webda-sanitize": "none"` to the property. See [Plain text attributes](../../Modules/models/Defining-Models.md#plain-text-attributes--sanitize-none).
