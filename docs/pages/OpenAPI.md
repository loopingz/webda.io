# OpenAPI Defintion

Webda takes care of the OpenAPI definition for you

You can generate the definition by typing

```
webda openapi
# With all the route even the non public
webda openapi --include-hidden
```

You can save it to a file by typing

```
webda openapi myapi.json
```

Webda complete the api definition as best as it can with the information it has.
But everytime you had a `Route` you can include your own additional configuration

```
@Route("/cloudprojects/{uuid}/scans/{environment}/report", "GET", false, {
    // My openapi additional information
})
```

The openapi definition you enter here will be merge @see OpenAPIWebdaDefinition