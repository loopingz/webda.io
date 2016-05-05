# webda [![Build Status](https://travis-ci.org/loopingz/webda.svg?branch=master)](https://travis-ci.org/loopingz/webda)

Composable Serverless API

## Goals

I have servers running for my own personal use for more than 10 years, because i wanted to have few websites and APIs online, but most of the time those servers are sitting and waiting.

Then came Lambda, really cool feature from AWS, but kind of tricky to turn it into a full webserver. That's one of the target of Webda.

I was bored also of always recoding the same API again and again with a few customizations for each client. So i wanted a system that leverage up the components system but on both the frontend and backend, the frontend moved a lot lately with JSF to GWT to Angular to ... ? Polymer ! Here is my winner, of course it will change but it is a good one i think and really like the WebComponents part, everything was in place to start the composable UI.



## Quickstart

You should checkout our demo project

### Create a project


```
npm install webda
node_module/.bin/./webda config
```

You'll have the configuration UI available, where you can create a service, use a service, or create a custom API resource.

### Create a new API
...


### Create a new service


### Run it

```
node_module/./bin/webda serve
```

### Deploy it to the cloud

First you need to create a deployment, from the configuration UI

Then just type :

```
node_module/./bin/webda aws-deploy Test
```

Your new API is ready to rock !

Now, go checkout the webcomponents available

## Stores

A Store is a service that handle Creation,Retreive,Update,Delete of an object, it also have basic handling for mapping and cascade delete.

You can decide to active the HTTP exposure on a store and then the url GET/POST/PUT/DELETE will be added to your API automatically to the endpoint of your choice

Events are thrown also before and after any operation done by the store to let you interfere with the operation by adding information to the object dynamically or even throwing exception to prevent the operation to happen

To help the development, we have include 3 differents types of stores of NoSQL type

### FileDB

Just a simple one that store the object on the filesystem in a folder flatten

### DynamoDB

link to dynamo / quick pres

### MongoDB

link to mongo / quick pres

## Services

For now, there is few services

### Authentication

Allow to login with Facebook, Google, GitHub and email.
It is based on Idents and Users concept, and use 2 stores to save those objects

### Mailer

What would be this world without a little bit of spam :)

### FileBinary

Expose an API for storing binary on the filesystem, and can expose it as an HTTP service, that will also handle the mapping with a field of any existing object

### S3Binary

The twin brother of the FileBinary, to enable you to do the same thing but in the cloud.

## Excecutors

When you define a manual API Resource, you have the choice between four kind

### File

Specify the javascript file, you want to execute and here you go

### Inline

If you have a small piece of Javascript and don't want to bother creating a file

### Lambda

You can call a Lambda function directly from here, whereever you decide to host your server, on site or on the cloud

### String

For demo purpose, mainly as it is only static content served

## Documentation
....




