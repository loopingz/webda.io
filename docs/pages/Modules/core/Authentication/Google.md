# Google Auth

A module exists `@webda/google-auth` to implement the Google Authentication SSO.

If you do not have `Authentication` service, then the service act as standalone, not creating `User` or `Ident`, simply defining the profile within the session.

## Configuration

When configured in Google API:
You can download credentials that looks like:

```json title="webda.config.json"
{
   "web": {
      "client_id": "...",
      "project_id": "...",
      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
      "token_uri": "https://oauth2.googleapis.com/token",
      "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
      "client_secret": "...",
      "redirect_uris": [...],
      "javascript_origins": [...]
   }
}
```

Add the `web` section within the configuration of the service

webda.config.json

```json title="webda.config.json"
...
   "GoogleAuth": {
      "url": "/auth/google",
      "no_referer": true,
      "type": "Webda/GoogleAuthentication",
      "client_id": "...",
      "project_id": "...",
      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
      "token_uri": "https://oauth2.googleapis.com/token",
      "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
      "client_secret": "...",
      "redirect_uris": [...],
      "javascript_origins": [...]
   },
...
```
