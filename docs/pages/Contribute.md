# Quick Start

Contribute with a new package or new service

## Create a new package

1. Create your folder /PACKAGE/
2. Create your first service in /packages/PACKAGE/src/SERVICE.ts

For example a service Storage :
```
export default class Storage<T extends StorageParameters = StorageParameters> extends Binary<T> {

}
```

3. Add your service name in /packages/PACKAGE/webda.module.json targeting final /lib/ files
```
{
  "services": {
    "Webda/GoogleCloudStore": "./lib/services/storage.js"
  }
}
```

4. Create your first unit test in /packages/PACKAGE/src/SERVICE.spec.ts
5. Define your new service in /packages/PACKAGE/test/config.json
If you extends Binary, you need to copy Users service frlom existing other package.

For example:
```
{
  "version": 2,
  "parameters": {
    "accessKeyId": "Bouzouf",
    "secretAccessKey": "Plop",
    "TEST": "Global",
    "region": "us-east-1",
    "website": ["test.webda.io", "test2.webda.io"],
    "csrfOrigins": ["^accounts\\.google\\.\\w{2,}$", "www\\.facebook\\.com"],
    "locales": ["es-ES", "en-GB", "fr-FR"],
    "sessionSecret": "Lp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5EN"
  },
  "module": {
    "services": {
      "Test/AWSEvents": "./moddas/awsevents"
    }
  },
  "services": {
    "Users": {
      "expose": {
        "url": "/users"
      },
      "type": "MemoryStore",
      "model": "Webda/User"
    },
    "binary": {
      "type": "Webda/GoogleCloudStore",
      "bucket": "webda-dev",
      "expose": {
        "url": "/binary"
      },
      "map": {
        "users": ["images"]
      }
    }
  }
}

```
