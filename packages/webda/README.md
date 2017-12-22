![](http://webda.io/images/touch/icon-128x128.png)

# webda [![Build Status](https://travis-ci.org/loopingz/webda.svg?branch=master)](https://travis-ci.org/loopingz/webda)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[SonarCloud.io](https://sonarcloud.io/dashboard/index/webda)

**Composable Serverless API**

[http://webda.io](http://webda.io)

## Goals

I have servers running for my own personal use for more than 10 years, because i wanted to have few websites and APIs online, but most of the time those servers are sitting and waiting.

Then came **Lambda**, really cool feature from AWS, but kind of tricky to turn it into a full webserver. That's one of the target of Webda.

I was bored also of always recoding the same API again and again with a few customizations for each client. So i wanted a system that leverage up the components system but on both the frontend and backend, the frontend moved a lot lately with JSF to GWT to Angular to ... ? **Polymer** ! Here is my winner, of course it will change but it is a good one i think and really like the WebComponents part, everything was in place to start the composable UI.

The **webda.config.json** contains the configuration of the app, defining Services, Routes and global configuration, you can consider it as the applicationContext.xml of Spring if you prefer, with Beans=Services

## Quickstart

You should checkout our demo project : [link](http://github.com/loopingz/webda-demo.git)

Check our video presentation on [Youtube](https://www.youtube.com/playlist?list=PLfn1MAL4_e7ERdqj9rWlmEkK5gMkL4bKI)


#### Create a project


```
npm install -g webda-shell
webda config
```

You have the configuration UI available, where you can create a service, use a service, or create a custom API resource. You can also manually edit the webda.config.json if you prefer

Below is the manual step with the manual modification, I would recommand to use the configuration UI to modify the webda.config.json

#### Create a new route

We will use the inline RouteHelper here, except the Lambda Route helper, the other are mainly helper for quick and easy test but you should use Service when you can as they are easier to unit test and make code cleaner.

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

We will create a new executor, so we can map some urls directly to the service

```javascript
const Executor = require('webda/services/executor')

class MyService extends Executor {

   init(config) {
   	 // Let's add our routes here, for Modda the URL should be dynamic
   	 config['/myservice']={method:["GET", "DELETE"], _method: this.handleRequest, executor: this};
   }
   
   delete(ctx) {
     // If we dont output anything, then the default result will be a 204
   }	
   
   get(ctx) {
    // Should output : I am a getter and i've sent an welcome email to you
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
       sentence: "I am a getter and i've sent an welcome email to you"
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

"I am a getter and i've sent an welcome email to you"

And then the http://localhost:18080/myurl

"I am a inline route"

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

You can also create and publish on Docker choising the deployment configuration you like

![image](http://webda.io/images/schemas/docker_deploy.png)

## Architecture

![image](http://webda.io/images/schemas/archi.png)


## Services

A service is a singleton component that can have access to others services, put some listeners in place, and do it's own logic. It is not supposed to handle direct request from the external world, so therefore doesn't have access to write method for output to the client.

Service implement the **EventEmitter** of NodeJS so you can emit message to let trap for other business services

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

Executors is a service family that handle the request.

## Stores

A Store is a executor that handle Creation,Retreive,Update,Delete of an object, it also have basic handling for mapping and cascade delete.

You can decide to active the HTTP exposure on a store and then the url GET/POST/PUT/DELETE will be added to your API automatically to the endpoint of your choice

Events are thrown also before and after any operation done by the store to let you interfere with the operation by adding information to the object dynamically or even throwing exception to prevent the operation to happen

To help the development, we have include 3 differents types of stores of NoSQL type

#### FileDB

Just a simple one that store the object on the filesystem in a folder flatten

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

By default the OwnerPolicy add your user id to the object you create on the user field. It will then check for GET/UPDATE/DELETE if you are the user that is reference in the field user. If your user has the same uuid as the object it allows you to perform the operation as well.


## Embedded Services

For now, there is few services

#### Authentication

Allow to login with Facebook, Google, GitHub and email, it is a Executor per say as it exposes some routes.
It is based on Idents and Users concept, and use 2 stores to save those objects, by default those Store are called "Idents" and "Users"

#### Mailer

What would be this world without a little bit of spam :) it is a pure service as it does not handle any route.

#### FileBinary

Expose an API for storing binary on the filesystem, and can expose it as an HTTP service, that will also handle the mapping with a field of any existing object.

The Binary services handle a challenge based on the binary data and a prefix to prevent upload of already stored data on the server, the webda-upload-behavior Polymer component implement it.

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

A Modda is a module defined and available publicly via Webda Marketplace, it allows you to define service that you can reuse in others projects and also use the one offer to you by the community.

You can provider a sample configuration, used when creating a new service based on this Modda. You must also define a configuration schema, so we can precheck that the configuration for your Modda is correct.

It is recommanded to add some documentation link to a markdown file, so we can also display the documentation to the end user.


## Documentation

You can find the Javascript documentation on github.io

## Configuration resolution

To ease up the configuration of an application we came up with the follow configuration resolution schema.

You have the global configuration for the application, that is override by the deployment configuration, that is override by the local element configuration, and finally override by the deployment element configuration.

![image](http://webda.io/images/schemas/configuration_resolution.png)

## Configuration UI

Here is some screenshots of the ui

#### Routes

![image](http://webda.io/images/schemas/ui_route_create.png) ![image](http://webda.io/images/schemas/ui_route_config.png) 

#### Services

![image](http://webda.io/images/schemas/ui_service_create.png) ![image](http://webda.io/images/schemas/ui_service_config.png)

#### Deployments

![image](http://webda.io/images/schemas/ui_deployment_create.png) ![image](http://webda.io/images/schemas/ui_deployment_config.png) ![image](http://webda.io/images/schemas/ui_deployment_deploy.png)

## Requirements

Node.js >= 5.0.0

## Limitation

Known Lambda limitation

The API Gateway limit to only one normal returnCode, so if you return any return code that is not planned, then we cannot set the cookie and update the session, nor we can send other headers.

You can specify the normal return code of a route by adding a configuration for AWS : 
aws: { defaultCode: 302, headersMap: ['header1', 'header2']}

Here we specify that this route will return 302 by default and will set http headers header1 and header2.

## Licence

### GNU Lesser General Public License


_Version 3, 29 June 2007_  
_Copyright © 2007 Free Software Foundation, Inc. &lt;<http://fsf.org/>&gt;_

Everyone is permitted to copy and distribute verbatim copies
of this license document, but changing it is not allowed.


This version of the GNU Lesser General Public License incorporates
the terms and conditions of version 3 of the GNU General Public
License, supplemented by the additional permissions listed below.

#### 0. Additional Definitions

As used herein, “this License” refers to version 3 of the GNU Lesser
General Public License, and the “GNU GPL” refers to version 3 of the GNU
General Public License.

“The Library” refers to a covered work governed by this License,
other than an Application or a Combined Work as defined below.

An “Application” is any work that makes use of an interface provided
by the Library, but which is not otherwise based on the Library.
Defining a subclass of a class defined by the Library is deemed a mode
of using an interface provided by the Library.

A “Combined Work” is a work produced by combining or linking an
Application with the Library.  The particular version of the Library
with which the Combined Work was made is also called the “Linked
Version”.

The “Minimal Corresponding Source” for a Combined Work means the
Corresponding Source for the Combined Work, excluding any source code
for portions of the Combined Work that, considered in isolation, are
based on the Application, and not on the Linked Version.

The “Corresponding Application Code” for a Combined Work means the
object code and/or source code for the Application, including any data
and utility programs needed for reproducing the Combined Work from the
Application, but excluding the System Libraries of the Combined Work.

#### 1. Exception to Section 3 of the GNU GPL

You may convey a covered work under sections 3 and 4 of this License
without being bound by section 3 of the GNU GPL.

#### 2. Conveying Modified Versions

If you modify a copy of the Library, and, in your modifications, a
facility refers to a function or data to be supplied by an Application
that uses the facility (other than as an argument passed when the
facility is invoked), then you may convey a copy of the modified
version:

* **a)** under this License, provided that you make a good faith effort to
ensure that, in the event an Application does not supply the
function or data, the facility still operates, and performs
whatever part of its purpose remains meaningful, or

* **b)** under the GNU GPL, with none of the additional permissions of
this License applicable to that copy.

#### 3. Object Code Incorporating Material from Library Header Files

The object code form of an Application may incorporate material from
a header file that is part of the Library.  You may convey such object
code under terms of your choice, provided that, if the incorporated
material is not limited to numerical parameters, data structure
layouts and accessors, or small macros, inline functions and templates
(ten or fewer lines in length), you do both of the following:

* **a)** Give prominent notice with each copy of the object code that the
Library is used in it and that the Library and its use are
covered by this License.
* **b)** Accompany the object code with a copy of the GNU GPL and this license
document.

#### 4. Combined Works

You may convey a Combined Work under terms of your choice that,
taken together, effectively do not restrict modification of the
portions of the Library contained in the Combined Work and reverse
engineering for debugging such modifications, if you also do each of
the following:

* **a)** Give prominent notice with each copy of the Combined Work that
the Library is used in it and that the Library and its use are
covered by this License.

* **b)** Accompany the Combined Work with a copy of the GNU GPL and this license
document.

* **c)** For a Combined Work that displays copyright notices during
execution, include the copyright notice for the Library among
these notices, as well as a reference directing the user to the
copies of the GNU GPL and this license document.

* **d)** Do one of the following:
    - **0)** Convey the Minimal Corresponding Source under the terms of this
License, and the Corresponding Application Code in a form
suitable for, and under terms that permit, the user to
recombine or relink the Application with a modified version of
the Linked Version to produce a modified Combined Work, in the
manner specified by section 6 of the GNU GPL for conveying
Corresponding Source.
    - **1)** Use a suitable shared library mechanism for linking with the
Library.  A suitable mechanism is one that **(a)** uses at run time
a copy of the Library already present on the user's computer
system, and **(b)** will operate properly with a modified version
of the Library that is interface-compatible with the Linked
Version.

* **e)** Provide Installation Information, but only if you would otherwise
be required to provide such information under section 6 of the
GNU GPL, and only to the extent that such information is
necessary to install and execute a modified version of the
Combined Work produced by recombining or relinking the
Application with a modified version of the Linked Version. (If
you use option **4d0**, the Installation Information must accompany
the Minimal Corresponding Source and Corresponding Application
Code. If you use option **4d1**, you must provide the Installation
Information in the manner specified by section 6 of the GNU GPL
for conveying Corresponding Source.)

#### 5. Combined Libraries

You may place library facilities that are a work based on the
Library side by side in a single library together with other library
facilities that are not Applications and are not covered by this
License, and convey such a combined library under terms of your
choice, if you do both of the following:

* **a)** Accompany the combined library with a copy of the same work based
on the Library, uncombined with any other library facilities,
conveyed under the terms of this License.
* **b)** Give prominent notice with the combined library that part of it
is a work based on the Library, and explaining where to find the
accompanying uncombined form of the same work.

#### 6. Revised Versions of the GNU Lesser General Public License

The Free Software Foundation may publish revised and/or new versions
of the GNU Lesser General Public License from time to time. Such new
versions will be similar in spirit to the present version, but may
differ in detail to address new problems or concerns.

Each version is given a distinguishing version number. If the
Library as you received it specifies that a certain numbered version
of the GNU Lesser General Public License “or any later version”
applies to it, you have the option of following the terms and
conditions either of that published version or of any later version
published by the Free Software Foundation. If the Library as you
received it does not specify a version number of the GNU Lesser
General Public License, you may choose any version of the GNU Lesser
General Public License ever published by the Free Software Foundation.

If the Library as you received it specifies that a proxy can decide
whether future versions of the GNU Lesser General Public License shall
apply, that proxy's public statement of acceptance of any version is
permanent authorization for you to choose that version for the
Library.

