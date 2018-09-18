<img src="https://webda.io/images/webda.svg" width="128px" />

# webda [![Build Status](https://travis-ci.org/loopingz/webda.svg?branch=master)](https://travis-ci.org/loopingz/webda)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=webda&metric=alert_status)](https://sonarcloud.io/dashboard/index/webda)

**Composable Serverless API**

[http://webda.io](http://webda.io)

## Goals

I have servers running for my own personal use for more than 10 years because I wanted to have few websites and APIs online, but most of the time those servers are sitting and waiting.

Then came **Lambda**, really cool feature from AWS, but kind of tricky to turn it into a full webserver. That's one of the targets of Webda.

I was bored also of always recoding the same API again and again with a few customizations for each client. So I wanted a system that leverages up the components system but on both the frontend and backend. The frontend moved a lot lately with JSF to GWT to Angular to ... ? **Polymer** ! Here is my winner, of course, it will change but it is a good one I think and I really like the WebComponents part, everything was in place to start the composable UI.

The **webda.config.json** contains the configuration of the app, defining Services, Routes, and global configuration, you can consider it as the applicationContext.xml of Spring if you prefer, with Beans=Services

## Quickstart

You should checkout our demo project : [link](http://github.com/loopingz/webda-demo.git)

Check our video presentation on [Youtube](https://www.youtube.com/playlist?list=PLfn1MAL4_e7ERdqj9rWlmEkK5gMkL4bKI)


#### Create a project


```
npm install -g webda-shell
webda config
```

You have the configuration UI available, where you can create a service, use a service, or create a custom API resource. You can also manually edit the webda.config.json if you prefer

Below is the manual step with the manual modification, I would recommend to use the configuration UI to modify the webda.config.json

#### Create a new route

We will use the inline RouteHelper here, except the Lambda Route helper, the others are mainly helpers for quick and easy tests but you should use `Service` when you can as they are easier to unit test and make code cleaner.

```javascript
{
  "*": "demo.webda.io",
  "demo.webda.io": {
      ...
      "/myurl": {
        "type": "inline",
        "callback": "function(ctx) { ctx.write('I am an inline route'); }"
      }
  }
}
```


#### Create a new service

We will create a new executor, so we can map some URLs directly to the service

```javascript
const Executor = require('webda/services/executor')

class MyService extends Executor {

   init(config) {
        // Let's add our routes here, for Modda the URL should be dynamic
        config['/myservice']={method:["GET", "DELETE"], _method: this.handleRequest, executor: this};
   }
   
   delete(ctx) {
     // If we don't output anything, then the default result will be a 204
   }    
   
   get(ctx) {
    // Should output : I am a getter and I've sent a welcome email to you
    ctx.write(this._params.sentence);
       let otherService = this.getService("Mailer");
       otherService.send();
   }
   
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
       require: "./myservice.js",
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
webda deploy Test
```

Your new API is ready to rock!

Now, go checkout the webcomponents available

### Lambda

True serverless application in a click, we will deploy your code on Lambda, do the API Gateway mapping and as much as we can so you can deploy in a glimpse of an eye

![image](http://webda.io/images/schemas/aws_deploy.png)

### Docker

You can also create and publish on Docker choosing the deployment configuration you like

![image](http://webda.io/images/schemas/docker_deploy.png)

## Architecture

![image](http://webda.io/images/schemas/archi.png)


## Services

A service is a singleton component that can have access to others services, put some listeners in place, and do its own logic. It is not supposed to handle direct request from the external world so, therefore, doesn't have access to write method for output to the client.

Service implement the **EventEmitter** of NodeJS so you can emit a message to let trap for other business services

```javascript
// Add a listener
getService("Store").on('Store.Save', (evt) => {
    // Do something
});

// Emit a event ( add the context if possible )
this.emit('Action.Done', {object: this.target, ctx: ctx})
```

## Executors

The **executors** are services that handle some routes directly, they have **access to the request body, the session, and can write out content to the client through the context object**. Executors derive from services, that's why the framework only see the element Service.

Executors is a service family that handles the request.

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

## RouteHelpers

The RouteHelpers are quick utils to test features but are not the best way to build a full application. When you define a manual API Resource, you have the choice between four kinds,

#### File

Specify the javascript file, you want to execute and here you go

#### Inline

If you have a small piece of Javascript and don't want to bother creating a file

#### Lambda

You can call a Lambda function directly from here, whereever you decide to host your server, on-site or in the cloud

#### String

For demo purpose, mainly as it is only static content served

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

## Configuration UI

Here are some screenshots of the UI

#### Routes

![image](http://webda.io/images/schemas/ui_route_create.png) ![image](http://webda.io/images/schemas/ui_route_config.png) 

#### Services

![image](http://webda.io/images/schemas/ui_service_create.png) ![image](http://webda.io/images/schemas/ui_service_config.png)

#### Deployments

![image](http://webda.io/images/schemas/ui_deployment_create.png) ![image](http://webda.io/images/schemas/ui_deployment_config.png) ![image](http://webda.io/images/schemas/ui_deployment_deploy.png)

## Requirements

Node.js >= 8.0.0

## Limitation

Known Lambda limitation

The API Gateway limit to only one normal returnCode, so if you return any return code that is not planned, then we cannot set the cookie and update the session, nor we can send other headers.

You can specify the normal return code of a route by adding a configuration for AWS : 
aws: { defaultCode: 302, headersMap: ['header1', 'header2']}

Here we specify that this route will return 302 by default and will set HTTP headers header1 and header2.
