# Concepts

Webda is a domain driven framework.

It means you should mainly focus on creating your business models.

Then Services exists to implement generic features:

- Store your models: Store, DynamoDB, MongoDB, Postgresql, Firebase, Memory, File
- Store your binaries: BinaryService, FileBinary, S3Binary, GCPStorage
- Expose your models: DomainService, GraphQLService
- Authenticatate: AuthenticationService, OAuthService
- Secure: Hawk, built-in sanitizer

You usually have needs for a few additional services that are unrelated to business models like integration with third parties.
To tackle this, create your Service or Bean.
A Service is designed to be reusable, where a Bean is a singeleton in your application and not designed to be reused elsewhere.

Althought there are other mechanisms we recommend using the annotations within the app to declare: @Bean, @Route, @Operation, @Action

Webda relies on Services (or Beans), they can expose some Routes and the Application can deployed using different types of Deployment

The configuration system relies on JSON files: `webda.config.json`, it can be seen as the `applicationContext.xml` of Spring framework.

The framework also simplifies the deployment with builtin support for AWS Lambda, Containers, local debug.

## Under the hood

Webda on compilation will produce a `webda.module.json` file, it analyzes your code to get the relationship between your models, the hierarchy of models, the structure of the models (JSON Schemas)

The framework at runtime read this reflective data to expose smartly its logic.

## Services

### Parameters

The service will be injected with parameters based on this expression

```js
{...app.parameters, ...deployment.parameters, ...service.parameters, ...deployment.service.parameters}
```

It allows you to share parameters with all services by defining them in the `parameters` section of `webda.config.json`
A deployment can then decide to override this parameters allowing you to override for example the `website` parameter to your specific deployment value.

## Routes

After all webda is there to create API, a Service can manage a route by using the `@Route` annotation or use the `._addRoute` method.

If the Service is not designed to be extend of reused the `@Route` annotation is the simplest way

```js

    @Route("/myroute", ["GET"])
    myHandler(ctx: Context) {
        // Do something
    }
```

If you plan to reuse your component, it might be a good idea to make its routes configurable to avoid any conflicts.

```js
class MyServiceParameter extends ServiceParameter {
    constructor(params) {
        super(params);
        // Define your default params here
    }
}

class MyService<T extends MyServiceParameter> extends Service<T> {
    resolve() {
        super.resolve();
        this._addRoute(...)
    }

    loadParameters(params: any) {
        return new MyServiceParameter(params);
    }
}
```

### Retrieve parameters

Within a service, you retrieve its parameter by calling the `this.parameter` property.

## Deployment

So you have a Application that works and is ready to deploy, the Deployment is a unit of Deployers that will lift your Application and deploy it to Kubernetes, Docker, Lambda.

A `Deployer` will create the Docker image and push it, or create the `.zip` to send to Lambda

## Application

This is your whole application including the `package.json` and the `webda.config.json`, so it is a group of `Services` and `Modules` defining your global application.

## Modules

You can create a module to share some behavior between different application by defining a `webda.module.json`

Webda on startup scan the node_modules for `webda.module.json`, it build its map of available ServicesType according to theses modules.

### Shell module

You add your custom command to the `webda` shell command by adding a `webda.shell.json`
