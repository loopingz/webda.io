# Cookies

By default the cookie is set with this options:

```
{
    path: "/",
    domain: ctx.getHttpContext().getHost(),
    httpOnly: true,
    secure: ctx.getHttpContext().getProtocol() == "https",
    maxAge: 86400 * 7,
    sameSite: "Lax"
}
```

## Override default configuration

By adding a cookie object in your `parameters` section of the `webda.config.json`
You can find the options here: (Cookie library)[https://www.npmjs.com/package/cookie]
