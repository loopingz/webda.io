# CORS

Any service can implement `RequestFilter` and will be called for every request

## Soft vote

The method `checkRequest(context: Context) : Promise<boolean>` is called, you can return `false` if the filter is not allowing the request, meaning that any other filter can still vet-in for the request by returning `true`

## Hard vote

The method can throw an exception to stop the process and return to the client an error.
