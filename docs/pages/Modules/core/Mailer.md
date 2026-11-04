# Mailer

`@webda/core` only keeps the mailer contracts: `AbstractMailer`, `MailerSendOptions` and the `DebugMailer` used by tests.

The nodemailer based `Mailer` (`Webda/Mailer`, `SES` and `smtp` transports) moved to its own module, see [`@webda/mailer`](../mailer/README.md).

## Migration

Install `@webda/mailer` in your application to keep using `Webda/Mailer`, the configuration does not change:

```bash
pnpm add @webda/mailer
```

Templates are now rendered with [`@webda/templates`](../templates/README.md) instead of `email-templates`.
