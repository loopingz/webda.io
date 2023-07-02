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

You can redefine the SessionManager service. And then set your parameters.

```
{
    "services": {
        "SessionManager": {
            "type": "Webda/CookieSessionManager",
            "cookie": {
                "path": "/",
                "domain": "localhost",
                "httpOnly": true,
                ...
            }
        }
    }
}
```

You can find the options here: (Cookie library)[https://www.npmjs.com/package/cookie]
