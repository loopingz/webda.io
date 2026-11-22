# Contribute

Contribute with a new package or new service

## Create a new package

1. Create your folder /packages/PACKAGE/
2. Create your first service in /packages/PACKAGE/src/SERVICE.ts

For example a service Storage :

```
/**
 * @WebdaModda GoogleCloudStorage
 */
export default class Storage<T extends StorageParameters = StorageParameters> extends CloudBinary<T> {

}
```

3. Build the package with `webdac build` (its `build` script): it generates /packages/PACKAGE/webda.module.json
   from the sources, do not edit it
4. Create your first unit test in /packages/PACKAGE/src/SERVICE.spec.ts
5. Define the configuration of your tests in /packages/PACKAGE/test/config.json

For example:

```
{
  "version": 4,
  "parameters": {},
  "services": {}
}
```
