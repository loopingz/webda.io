# Routes

API have endpoints also called routes.

To define a Route it is pretty simple.

In a service define a method with a single parameter context

```js title="src/myservice.ts"
class Service {
    ...
    @Route("/hi", ["GET"])
    myRoute(context: Context) {

    }
    ...
}

```

We use [uri-templates](https://www.npmjs.com/package/uri-templates) to parse uri

## Path arguments

Wildcard path: `/test/{path+}` will map all the rest of the uri

## Query arguments

The search part of the query can be usefull too and need to be declared
It starts with a `{?...}`

Each argument of the query is then named `{?arg1,arg2,arg3?,args*}`

In the above example:

- arg1 is mandatory
- arg2 is mandatory
- arg3 is optional
- args collects all the remaining query params

If no query params is defined as mandatory, then query is optional
If you want to collect all params while making the query params mandatory use the `+` sign instead of `*`

## Prefix

You can prefix all routes by adding a `routePrefix` in your global parameters of webda.
To override the prefix you can use the `//` in your route definition, to define it as absolute.

```
# With a api prefix defined
//test/plop => /test/plop
/api/plop => /api/plop
/plop2 => /api/plop2
```

## Aliases

Route aliases map incoming URL patterns to another URL of the same application. The target can resolve variables from the request context (such as the authenticated user's ID).

Aliases are evaluated in-process before normal route matching, allowing any existing route or `@Operation` to be exposed through convenient shortcuts (e.g. `/me` &rarr; `/users/${user.id}`) without modifying the underlying service.

### Configuration

Aliases can be configured statically in `webda.config.jsonc` under the `Router` service parameters:

```jsonc
// webda.config.jsonc
{
  "services": {
    "Router": {
      "type": "Webda/Router",
      "aliases": {
        "/me": "/users/${user.id}",
        "/me/{+rest}": "/users/${user.id}/${params.rest}",
        "/my/orders{?q*}": {
          "target": "/orders?userId=${user.id}&${params.q*}",
          "methods": ["GET"]
        },
        "/docs": {
          "target": "/static/docs/index.html",
          "mode": "redirect"
        }
      }
    }
  }
}
```

Or registered programmatically at runtime:

```typescript
import { useRouter } from "@webda/core";

useRouter().addAlias("/me", "/users/${user.id}");
useRouter().removeAlias("/me");
```

### Supported Placeholders

Target URLs support a strict, precompiled set of placeholders:

| Placeholder | Value | When undefined |
|---|---|---|
| `${user.id}` | `ctx.getCurrentUserId()` | Throws `Unauthorized` (401) |
| `${params.<name>}` | Parameter captured by `{name}`, `{+name}`, or `{?name}` | Empty string (`""`) |
| `${params.<name>*}` | Catch-all query object serialized as `key=value&...` | Empty string (`""`) |

### Rewrite vs Redirect

* **Rewrite (default, `mode: "rewrite"`)**: The alias is resolved internally without an extra network round-trip. The matched route receives the resolved target and parameters, while `ctx.getHttpContext().getUrl()` preserves the original URL called by the client. The context extension `ctx.getExtension("routeAlias")` contains `{ alias, target }`.
* **Redirect (`mode: "redirect"`)**: An HTTP redirect is issued immediately to `httpContext.getAbsoluteUrl(target)`. Status code defaults to `302` (configurable via `redirectCode: 301 | 302 | 307 | 308`). Redirect aliases are hidden from OpenAPI by default unless `openapi: true`.

### Security Note

Alias target placeholders are strictly evaluated without `eval` or dynamic code execution. All values are automatically URL-encoded (`encodeURIComponent`), with `{+rest}` path parameters encoding each path segment while preserving slashes. Resolved targets containing path traversal segments (`..`) are rejected with `BadRequest` (400). Unrecognized placeholders are rejected at configuration load time.

# Conditional Routes

When using the `@Route` annotation, you can still do conditional expose by overriding default behavior of `getUrl` method.

```js
  /**
   * @override
   */
  getUrl(url: string, methods: HttpMethodType[]) {
    // If url is absolute
    if (url.startsWith("/")) {
      return url;
    }

    // Parent url to find here
    const expose = this.parameters.expose;
    if (
      !expose.url ||
      (url === "." && methods.includes("POST") && expose.restrict.create) ||
      (url === "./{uuid}" && methods.includes("DELETE") && expose.restrict.delete) ||
      (url === "./{uuid}" && methods.includes("PATCH") && expose.restrict.update) ||
      (url === "./{uuid}" && methods.includes("PUT") && expose.restrict.update) ||
      (url === "./{uuid}" && methods.includes("GET") && expose.restrict.get) ||
      (url === ".{?q}" && methods.includes("GET") && expose.restrict.query) ||
      (url === "." && methods.includes("PUT") && expose.restrict.query)
    ) {
      return undefined;
    }
    return super.getUrl(url, methods);
  }
```
