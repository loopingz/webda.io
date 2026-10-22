---
sidebar_label: "@webda/mailer"
---
# mailer

`@webda/mailer` provides the `Mailer` service (`Webda/Mailer`): a mailer based on [nodemailer](https://nodemailer.com/) that renders its templates with [`@webda/templates`](../templates/README.md) and inlines the CSS of the html part with [juice](https://github.com/Automattic/juice).

```bash
pnpm add @webda/mailer
```

## Configuration

The service parameters are also the nodemailer `createTransport` options (`host`, `port`, `auth`, `SES`, ...), see the [nodemailer SMTP documentation](https://nodemailer.com/smtp/).

```jsonc
{
  "services": {
    "Mailer": {
      "type": "Webda/Mailer",
      "sender": "no-reply@example.com",
      "host": "smtp.example.com",
      "port": 465,
      "secure": true,
      "auth": { "user": "webda", "pass": "..." }
    }
  }
}
```

| Parameter | Default | Description |
| --- | --- | --- |
| `sender` | | Default `from` when the email does not define one |
| `templates` | | Folder of the mailer own templates (see [Templates](#templates)) |
| `templatesEngine` | `"mustache"` | Engine of the mailer own renderer |
| `templateService` | `"TemplateService"` | Service to render with when neither `templates` nor `templatesEngine` are set |
| `emailTemplateOptions.juiceResources` | see [juice options](#juice-options) | juice `juiceResources` options used on the html part |
| `transport` | | Type of transport, for example `ses` |
| `SES` | | SES options when `transport` is `ses` |

`auth.pass` and `SES.credentials` can be encrypted with `webda config encrypt`.

## Templates

A mail template is a multi-part template folder: `NAME/subject`, `NAME/html` and `NAME/text` (any engine extension, `.mustache` by default). The renderer used depends on the configuration, in this order:

1. `templates` or `templatesEngine` set on the mailer: the mailer uses its own renderer on `templates` (default `./templates`). An explicit mailer configuration always wins, so adding a `TemplateService` for another use never moves the mailer templates.
2. Otherwise, if the `templateService` service (default `TemplateService`) exists: the mailer renders through it, with its folders, locale fallback and partials.
3. Otherwise: the mailer uses its own renderer on `./templates` with `mustache`.

A configuration that only declares the `Mailer` keeps working without a `TemplateService`.

```jsonc
{
  "services": {
    // Case 2: the mailer renders with the TemplateService
    "TemplateService": { "type": "Webda/TemplateService", "folders": ["./templates", "./node_modules/my-lib/templates"] },
    "Mailer": { "type": "Webda/Mailer", "sender": "no-reply@example.com" }
  }
}
```

When sending with a `template`, the mailer renders every part with the `replacements` plus a `now` date, and the email `locale`:

```typescript
await useService("Mailer").send({
  to: "bob@example.com",
  template: "WELCOME",
  replacements: { name: "Bob" },
  locale: "fr"
});
```

- `subject` is trimmed.
- `html` goes through juice with the `email-templates` defaults: resolvable `<link>` stylesheets are fetched into `<style>` blocks, `<style>` blocks are kept and **not** applied to the elements, images are not inlined. Set `juiceResources.applyStyleTags: true` to inline the `<style>` rules as `style` attributes.
- When the template has an `html` part but no `text` part, `text` is generated from the html with [html-to-text](https://github.com/html-to-text/node-html-to-text) (images skipped).
- An unknown template rejects with `Unknown mail template`.

### juice options

`emailTemplateOptions.juiceResources` is passed to `juice.juiceResources`, deep merged over the `email-templates@13` defaults:

```jsonc
{
  "applyStyleTags": false,
  "removeStyleTags": false,
  "webResources": { "images": false, "relativeTo": "<templates folder>" }
}
```

`webResources.relativeTo` defaults to the templates folder: the mailer `templates` folder in cases 1 and 3, the first folder of the `TemplateService` in case 2. Any option you set wins, `webResources` keys being merged one by one.

```jsonc
{
  "type": "Webda/Mailer",
  "emailTemplateOptions": {
    "juiceResources": {
      // Inline the <style> rules as style attributes and drop the <style> blocks
      "applyStyleTags": true,
      "removeStyleTags": true,
      "preserveImportant": true,
      "webResources": { "relativeTo": "./assets/mail", "images": 8 }
    }
  }
}
```

Like `email-templates`, the mailer sets the juice global `tableElements` setting to `["TABLE"]`: juice reads it from its module, it cannot be set per call, so it applies to every juice user of the process.

:::warning Security

juice (through `web-resource-inliner`) fetches the `<link>` stylesheets of the rendered html over the network and reads local files relative to `webResources.relativeTo`. Never put untrusted values unescaped (`{{{…}}}` in mustache) into an html template: an injected `<link>` could make the server fetch arbitrary URLs or inline local files into the email. If your templates do not need external stylesheets, disable them with `emailTemplateOptions.juiceResources.webResources.links: false`.

:::

## Migration from `@webda/core`

The nodemailer `Mailer` used to ship with `@webda/core`. It now lives in this package, still as `Webda/Mailer`:

- Add `@webda/mailer` to your application dependencies; the configuration does not change.
- `email-templates` is no longer used: templates render through `@webda/templates`, `emailTemplateOptions` only keeps `juiceResources`. The `preview` browser opening in development and the `email-templates` i18n locals are gone, juice only runs on the html part.
- `hasNotification` is now async, `_getTemplate`, `IEmailTemplate` and `TemplatesMap` are removed.
- `@webda/core` keeps `AbstractMailer`, `MailerSendOptions` and `DebugMailer`.
