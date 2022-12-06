# Webda.io

Changelog has only be initiated on version 2.2.0


## Next

### Move from _jsonFilter to attributePermission method

To allow full customization and attributes based permission, the attributePermission method has been added:

```
/**
  * Define attribute permissions
  * @param key
  * @param value
  * @returns
  */
attributePermission(key: string, value: any, mode: "READ" | "WRITE"): any {
  /**
    * By default attribute with `_` prefix are readOnly
    * attribute with `__` prefix are serverOnly
    */
  if (key[0] === "_" && (mode === "WRITE" || (key.length > 1 && key[1] === "_"))) {
    return undefined;
  }
  return value;
}
```

This method is called by the `load` method when unsecured with `WRITE` mode and it is called when by the `_toJSON` method when sending to external systems.

## 2.2.0

The module @webda/shell should not be used as global installed anymore, it is generates glitches than we want to avoid.

### Fixes

- shell/containerdeployer: Git repository info are now passed to containerized build webda
- shell/containerdeployer: buildah stdin was not reading correctly the container definition
- google-auth: don't 500 if oauth state is not present

### Deployer resources access to environment variables

To allow deployment to use secrets exposed as environment variables like in GitHub Actions.

```deployment.json
{
    "units": [{
      "type": "WebdaDeployer/Kubernetes",
      "name": "Kubernetes",
      "tag": "${env.TAG}",
      "secret": "${env.MY_SECRET}
      ...
    }]

}
```

This can also be used in the deployment resource itself (for Kubernetes deployer)

```
containers:
- name: webda
    image: ${resources.tag}
    env:
    - name: MY_SECRET
        value: ${resources.MY_SECRET}
```

### AsyncOperationAction and Scheduler

The async module now contains a predefined AsyncAction for Webda async action, including crontab, scheduling tasks with its scheduler and several entrypoint

The `AsyncJobService` has several ways to launch, see the AsyncActions documentation.

### Raw Proxy

The proxy service of `@webda/core` now include a method to passthrough a custom request to another host:

```
this.proxyService.rawProxy(context, "google,com", "/subpath", headers)
```

### Operations

Operations are defined method that are designed to be called by a User from different entrypoint:

- Command Line
- REST API
- WebSockets
- Slack
- ...

### Store multi model

You can now store several model within the same Store, very useful for registry type of Store.

A default model is still existing, for things created through POST api, the `factory` concept in that case allows you to create different type of Model based on the content of the POST

New store parameters have been added:
`defaultModel`: if the stored object relate to a model that does not exist in the app, it will use the default store model
`forceModel`: make the store ignore completely the stored \_\_type to always use its default model defined in the parameter `model`

This update is not a BREAKING CHANGE, because the Store parameters default paremeters are now:

```
 defaultModel: true,
 forceModel: false,
 strict: false
```


### Kubernetes shell cronjob exporter

In case you want to have the templates of all your Cron defined methods of your application
You can now run

```
yarn run webda kubernetes cronExport templateFile outputDir 
```

It will use your templateFile to create CronJob resources in your outputDir. 