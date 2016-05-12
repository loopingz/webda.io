# webda [![Build Status](https://travis-ci.org/loopingz/webda.svg?branch=master)](https://travis-ci.org/loopingz/webda)

**Composable Serverless API**

## Goals

I have servers running for my own personal use for more than 10 years, because i wanted to have few websites and APIs online, but most of the time those servers are sitting and waiting.

Then came Lambda, really cool feature from AWS, but kind of tricky to turn it into a full webserver. That's one of the target of Webda.

I was bored also of always recoding the same API again and again with a few customizations for each client. So i wanted a system that leverage up the components system but on both the frontend and backend, the frontend moved a lot lately with JSF to GWT to Angular to ... ? **Polymer** ! Here is my winner, of course it will change but it is a good one i think and really like the WebComponents part, everything was in place to start the composable UI.


## Quickstart

You should checkout our demo project : [link](http://github.com/loopingz/webda-demo.git)

Here is also the Youtube video to run it

#### Create a project


```
npm install -g webda-shell
webda config
```

You'll have the configuration UI available, where you can create a service, use a service, or create a custom API resource.

#### Create a new API
...


#### Create a new service


#### Run it

```
webda serve
```

## Deploy it to the cloud

First you need to create a deployment, from the configuration UI

Then just use the Deploy button on the UI or the webda bin :

```
webda deploy Test
```

Your new API is ready to rock !

Now, go checkout the webcomponents available

### Lambda

True serverless application in a click, we will deploy your code on Lambda, do the API Gateway mapping and as much as we can so you can deploy in a glimpse of an eye

![image](http://webda.io/images/schemas/aws_deploy.png)

### Docker

You can also creaste and publish on Docker choising the deployment configuration you like

![image](http://webda.io/images/schemas/docker_deploy.png)

## Architecture

![image](http://webda.io/images/schemas/archi.png)


## Services

A service is a singleton component that can have access to others services, put some listeners in place, and do it's own logic. It is not supposed to handle direct request from the external world, so therefore doesn't have access to write method for output to the client. Service implement the EventEmitter of NodeJS so you can emit message to let trap for other business services

## Executors

The executors are services that handle some routes directly, they have access to the request body, the session, and can write out content to the client. Executors derive from services, that's why the framework only see the element Service. Executors is a service family thant handle the request.

## Stores

A Store is a executor that handle Creation,Retreive,Update,Delete of an object, it also have basic handling for mapping and cascade delete.

You can decide to active the HTTP exposure on a store and then the url GET/POST/PUT/DELETE will be added to your API automatically to the endpoint of your choice

Events are thrown also before and after any operation done by the store to let you interfere with the operation by adding information to the object dynamically or even throwing exception to prevent the operation to happen

To help the development, we have include 3 differents types of stores of NoSQL type

#### FileDB

Just a simple one that store the object on the filesystem in a folder flatten

#### DynamoDB

link to dynamo / quick pres

#### MongoDB

link to mongo / quick pres


## Embedded Services

For now, there is few services

#### Authentication

Allow to login with Facebook, Google, GitHub and email, it is a Executor per say as it exposes some routes.
It is based on Idents and Users concept, and use 2 stores to save those objects, by default those Store are called "Idents" and "Users"

#### Mailer

What would be this world without a little bit of spam :) it is a pure service as it does not handle any route.

#### FileBinary

Expose an API for storing binary on the filesystem, and can expose it as an HTTP service, that will also handle the mapping with a field of any existing object

#### S3Binary

The twin brother of the FileBinary, to enable you to do the same thing but in the cloud.

## RouteHelpers

Ther RouteHelpers are more a quick utils to test feature, but are not the best way to build a full application. When you define a manual API Resource, you have the choice between four kind,

#### File

Specify the javascript file, you want to execute and here you go

#### Inline

If you have a small piece of Javascript and don't want to bother creating a file

#### Lambda

You can call a Lambda function directly from here, whereever you decide to host your server, on site or on the cloud

#### String

For demo purpose, mainly as it is only static content served

## Moddas

A Modda is a module defined and available publicly via Webda Marketplace, it allows you to define service that you can reuse in others projects and also use the one offer to you by the community


## Documentation

You can find the Javascript documentation on github.io

## Requirements

Node.js >= 5

## Limitation

Known Lambda limitation

The API Gateway limit to only one normal returnCode, so if you return any return code that is not planned, then we cannot set the cookie and update the sesssion, nor we can send cookie.

You can specify the normal return code of a route by adding a configuration for AWS : 
aws: { defaultCode: 302, headersMap: ['header1', 'header2']}

Here we specify that this route will return 302 by default and will set http headers header1 and header2.

## Licence

...


