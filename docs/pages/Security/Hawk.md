# Hawk

You can enable [Hawk implementation](https://github.com/mozilla/hawk)

By doing so, you have to sign each request with an api key and the server will also sign its own response.

If you implement other `RequestFilter`, you can override the need to sign request.

The service requires a `Store` to store the authorized ApiKeys

## Api Keys

The Api Keys can also restrict which endpoints can be used by this specific key.
It also handles the Origin checks to restrict the Api Key to a specific website.
