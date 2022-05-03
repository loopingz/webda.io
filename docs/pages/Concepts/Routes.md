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

Wildcard path: `/test/{path*}` will map all the rest of the uri

## Query arguments

The search part of the query can be usefull too and need to be declared

