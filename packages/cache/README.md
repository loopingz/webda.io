# @webda/cache

A simple cache system

You can create your own cache annotation to fine-grained control the caching.
It cache based on the object instance, the method and the arguments provided.

A ttl drive cache, you can use to avoid querying too much a remote service for example

```
const ttlCache: {caches: Map<any, any>} = {} as any;
const TTLCache = createCacheAnnotation(() => ttlCache, { ttl: 60000 });
```
