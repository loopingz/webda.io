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
