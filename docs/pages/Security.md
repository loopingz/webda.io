# Security

Webda includes some basic protection

HTML tags are stripped by default when reading request from context.
It prevents [Stored XSS](https://portswigger.net/web-security/cross-site-scripting/stored)

```javascript
ctx.getRequestBody()

```

## CSRF Filters

