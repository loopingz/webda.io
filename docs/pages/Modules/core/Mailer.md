# Mailer

Webda defines a Mailer as a service that can send emails and render templates.

It uses `TemplateService` for template rendering and resolution, and `juice` for CSS inlining.

It can manage `SES` and `smtp`.

## Configuration

For nodemailer transport options, please refer to [nodemailer](https://nodemailer.com/smtp/).

```jsonc
{
  "services": {
    "Mailer": {
      "type": "Webda/Mailer",
      "sender": "noreply@example.com",
      "transport": "smtp",
      "host": "smtp.example.com",
      "templateService": "TemplateService"
    }
  }
}
```

> **Note:** The `templates` and `templatesEngine` parameters on `MailerParameters` are deprecated. Use [`TemplateService`](./Templates.md) for template configuration.
