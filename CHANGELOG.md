# Webda.io

Changelog has only be initiated on version 2.2.0

## next

### Breaking Changes

- Actions are no longer adding a `_` prefix to the implementation method, typescript usage of `protected` or `private` is enough.
- Constructor are now typed which can break compilation when used without typing

### Fixes

- `webda debug -w` was not passing the websockets argument to the debugged server
- websockets server kept trying to validate cors even with `devMode` on
- Add more typings to Store to verify model attribute
- Compilation is now returning -1 when failing
- CORS are not checked if no origin is sent

### WebSockets module

A whole new module to allow modern WUI to connect to frontend and subscribe to models modification events.

Backend services can connect to the frontend to forward their events with `WebSocketsClientService`

### webda debug launch

You can now use `webda debug` with other commands like `launch` to hot reload a worker method

### Custom AsyncWebdaAction

You can now define the model to use with your `AsyncService`

### FileUtils.find

We removed `fs-finder` module as it was too old, and we implemented a basic feature to search

## 2.4.2

### Allow yaml file for FileConfiguration

FileConfiguration can now load yaml file as configuration.
If default configuration is defined, the configuration file is auto created according to the default configuration

## 2.4.1

Fix bad content-length generation by removing it

## 2.4.0

### Prometheus

Add Prometheus metrics system.

You can add a PrometheusService to serve the metrics to Prometheus server

To listen on another port to avoid exposing metrics on public endpoint

```
{
  "type": "Webda/PrometheusService",
  "portNumber": 9090
}
```

The `store.ts` file is a good example on how to use metrics

### @webda/workout bunyan logger compatibility

You can use `getBunyanLogger()` to get a compatible logger

### async executeAsAsyncAction

This method execute within the current node process the method and arguments as an AsyncAction

## 2.3.1

### Fixes

- Docker build with deployment was failing due to `webda` command not available globally anymore
- AliasStore was not exposed through `Modda` nor exported, making it hard to use

### Action annotation

For model to define an `Action` you can now just use the `@Action` annotation.
Reminder: an Action is usually exposed through REST with `PUT /models/{uuid}/myAction`

## 2.3.0

### Attribute based permission

Sometime part of the object should not be readable or updatable by certain persona.

To address this we moved `_jsonFilter` to `attributePermission`
`_jsonFilter` is now deprecated and will be removed in 3.0

```
  /**
   * Allow to define custom permission per attribute
   * @param key
   * @param value
   * @param mode
   * @param context
   * @returns
   */
  attributePermission(key: string, value: any, mode: "READ" | "WRITE", context?: OperationContext) {
    if (mode === "WRITE") {
      return !key.startsWith("_");
    } else {
      return !key.startsWith("__");
    }
  }
```

You can use this feature to mask attribute in storage or read:

```
attributePermission(key: string, value: any, mode: "READ" | "WRITE", context?: OperationContext): any {
  if (key === "card") {
    const mask = "---X-XXXX-XXXX-X---";
    value = value.padEnd(mask.length, "?");
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === "X") {
        value = value.substring(0, i) + "X" + value.substring(i + 1);
      }
    }
    return value;
  }
  return super.attributePermission(key, value, mode, context);
}
```

This is the default implementation that keeps Webda default behavior.

### Core singleton

To move to Domain Driven system, Webda Core is now registering as a singleton.
Based on the registry multi model, an easier way to use webda could emerge

```
new Core();
MyModel.get("id")
```

### WebdaQL Setter Expression

You can now use WebdaQL to set some attributes of an object

```
const target = {};
new WebdaQL.SetterValidator("toto.info = 'x' AND toto.plop = 12").eval(target);
// Will set object target to
{
  toto: {
    plop: 12,
    info: 'x'
  }
}
```

### Kubernetes arguments spreader

You can use the replacement `${...cron.args}` in your Kubernetes deployment template to
spread the cron arguments into an array

### Custom launcher

If you specify a launcher in your `webda` section of package.json

```
 "webda": {
   "launcher": {
     "service": "serviceName",
     "method": "serviceMethod"
   }
 }
```

The launch shell method will launch through this service, it is useful combine with the `AsyncJobService.launchAsAsyncAction` to make local launch async actions.

### AliasStore

This store allows you to expose a subset of an another store.
This is useful to have only one Store that is the backend or just use the registry. Then you can expose different models from that Store like `/users`, `/groups` etc

AliasStore has some limitation:

- cannot store several models
- enforce the model

Mapper can be used on top of AliasStore as they behave like normal Store

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
