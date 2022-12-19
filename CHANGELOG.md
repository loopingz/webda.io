# Webda.io

Changelog has only be initiated on version 2.2.0

## next

### Throttler

This is a util class that allows to define how many promise to execute in concurrency and queue the remaining one. There are many libraries doing that, just wanted to provide one for Webda.

The concurrency can be dynamically updated, and the returned queue promise resolve when the item added resolve, making it easier to throttle part of an app by using a dedicated throttler.

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
