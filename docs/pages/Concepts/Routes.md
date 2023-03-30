# Routes

API have endpoints also called routes.

To define a Route it is pretty simple.

In a service define a method with a single parameter context

```
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
