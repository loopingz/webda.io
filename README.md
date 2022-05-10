# webda

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

**Composable Serverless API**

[https://webda.io](https://webda.io)

## Goals

Back in 2014, I had servers running for my own personal use for more than 10 years because I wanted to have few websites and APIs online, but most of the time those servers are sitting and waiting. Then came **Lambda**, really cool feature from AWS, but it was tricky to turn it into a full webserver. That's one of the targets of Webda.

Since AWS became better with nice framework like Amplify or Serverless. Webda stayed useful as it does provide a true framework of development with some vague inspiration from Spring. It does the heavy lifting for you to abstract NoSQL, to abstract the run environment (Lambda or Kubernetes or custom)

The **webda.config.json** contains the configuration of the app, defining Services, Routes, and global configuration, you can consider it as the applicationContext.xml of Spring if you prefer, with Beans=Services

## Quickstart

You should checkout our demo project : [link](https://github.com/loopingz/webda.io/sample-app/)

#### Create a project

```
npx @webda/shell config
# Or install it globally
npm install -g @webda/shell
# or with yarn
yarn global add @webda/shell
```

You have the configuration UI available, where you can create a service, use a service, or create a custom API resource. You can also manually edit the webda.config.json if you prefer

Below is the manual step with the manual modification, I would recommend to use the configuration UI to modify the webda.config.json

#### Create a new service

We will create a new executor, so we can map some URLs directly to the service

```javascript
import { Service, Route } from '@webda/core';

class MyService extends Service {

   delete(ctx) {
     // If we don't output anything, then the default result will be a 204
   }

   get(ctx) {
    // Should output : I am a getter and I've sent a welcome email to you
    ctx.write(this._params.sentence);
       let otherService = this.getService("Mailer");
       otherService.send();
   }

   @Route("/myservice", ["GET", "DELETE"])
   handleRequest(ctx) {
     if (ctx._route._http.method === "GET") {
         this.get(ctx);
     } else {
        this.delete(ctx);
     }
   }
)
```

Here is the corresponding configuration

```javascript
{
  ...
  services: {
     ...
     "MyService": {
       sentence: "I am a getter and I've sent a welcome email to you"
     }
     ...
  }
  ...
}

```

#### Run it

```
webda serve
```

You can call the http://localhost:18080/myservice, and see the nice output

"I am a getter and I've sent a welcome email to you"

And then the http://localhost:18080/myurl

"I am an inline route"

## Deploy it to the cloud

First, you need to create a deployment, from the configuration UI

Then just use the Deploy button on the UI or the webda bin :

```
webda deploy -d Test
```

Your new API is ready to rock!

Now, go checkout the webcomponents available

### CloudFormationDeployer

True serverless application in a click, we will deploy your code on Lambda, do the API Gateway mapping and as much as we can so you can deploy in a glimpse of an eye

![image](http://webda.io/images/schemas/aws_deploy.png)

### Docker

You can also create and publish on Docker choosing the deployment configuration you like

![image](http://webda.io/images/schemas/docker_deploy.png)

## Architecture

![image](http://webda.io/images/schemas/archi.png)

## Services

A service is a singleton component that can have access to others services, put some listeners in place, and do its own logic.

Service implement the **EventEmitter** of NodeJS so you can emit a message to let trap for other business services

```javascript
// Add a listener
getService("Store").on("Store.Save", evt => {
  // Do something
});

// Emit a event ( add the context if possible )
this.emit("Action.Done", { object: this.target, ctx: ctx });
```

## Stores

A Store is an executor that handle Creation, Retrieve, Update, Delete of an object, it also has basic handling for mapping and cascade delete.

You can decide to active the HTTP exposure on a store and then the URL GET/POST/PUT/DELETE will be added to your API automatically to the endpoint of your choice

Events are thrown also before and after any operation is done by the store to let you interfere with the operation by adding information to the object dynamically or even throwing an exception to prevent the operation to happen.

To help the development, we have included 3 different types of stores of NoSQL type

#### FileDB

Just a simple one that stores the object on the filesystem in a folder flatten

#### DynamoDB

DynamoDB is the NoSQL as a Service from AWS, it is nice to use along with Lambda deployment to have true serverless application.

The implementation is for now really basic, and need some improvement

Checkout the [AWS Website](https://aws.amazon.com/dynamodb/)

#### MongoDB

MongoDB is one of the most popular NoSQL server.

The implementation is for now really basic, and need some improvement

Checkout the [AWS Website](https://aws.amazon.com/dynamodb/)

### Policies

Store by default use the OwnerPolicy, policies define who has the right to access the REST API endpoint for a store.

#### OwnerPolicy

By default, the OwnerPolicy add your user id to the object you create in the user field. It will then check for GET/UPDATE/DELETE if you are the user that is referenced in the user field. If your user has the same UUID as the object, then it allows you to perform the operation as well.

## Embedded Services

For now, there are few services

#### Authentication

Allows to log in with Facebook, Google, GitHub, and email. It is an Executor per say as it exposes some routes.
It is based on Idents and Users concept, and use 2 stores to save those objects, by default those Stores are called "Idents" and "Users"

#### Mailer

What would be this world without a little bit of spam :) it is a pure service as it does not handle any route.

#### FileBinary

Expose an API for storing binaries on the filesystem, and can expose it as an HTTP service, that will also handle the mapping with a field of an existing object.

The Binary services handle a challenge based on the binary data and a prefix to prevent upload of already stored data on the server, the webda-upload-behavior Polymer component implements it.

#### S3Binary

The twin brother of the FileBinary, to enable you to do the same thing but in the cloud.

## Moddas

A Modda is a module defined and available publicly via Webda Marketplace, it allows you to define service that you can reuse in others projects and also use the one offer to you by the community.

You can provide a sample configuration, used when creating a new service based on this Modda. You must also define a configuration schema, so we can precheck that the configuration for your Modda is correct.

It is recommended to add some documentation link to a markdown file, so we can also display the documentation to the end user.

## Documentation

You can find the Javascript documentation on github.io

## Configuration resolution

To ease up the configuration of an application we came up with the following configuration resolution schema.

You have the global configuration for the application, that is override by the deployment configuration, that is override by the local element configuration, and finally, override by the deployment element configuration.

![image](http://webda.io/images/schemas/configuration_resolution.png)

## Annotations

@Bean({name: "", instance: ""})
@Route({url: "", methods: [], swagger: {}})

## Requirements

Node.js >= 14.0.0
