# webda

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

**Composable Serverless API**

[https://webda.io](https://docs.webda.io)

## Summary

Webda is a framework that provides a dependencies injection system, model-driven applications with multidatabase abstraction and deployment strategy that includes Lambda/APIGateway, Kubernetes.

## Quickstart

You should checkout our demo project : [link](https://github.com/loopingz/webda.io/sample-app/)

#### Create a project

```
npx @webda/shell init
```

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

## Documentation

You can find the Javascript documentation on https://docs.webda.io

## Configuration resolution

To ease up the configuration of an application we came up with the following configuration resolution schema.

You have the global configuration for the application, that is override by the deployment configuration, that is override by the local element configuration, and finally, override by the deployment element configuration.

![image](http://webda.io/images/schemas/configuration_resolution.png)

## History

Back in 2014, I had servers running for my own personal use for more than 10 years because I wanted to have few websites and APIs online, but most of the time those servers are sitting and waiting. Then came **Lambda**, really cool feature from AWS, but it was tricky to turn it into a full webserver. That's one of the targets of Webda.

Since AWS became better with nice framework like Amplify or Serverless. Webda stayed useful as it does provide a true framework of development with some vague inspiration from Spring. It does the heavy lifting for you to abstract NoSQL, to abstract the run environment (Lambda or Kubernetes or custom)

The **webda.config.json** contains the configuration of the app, defining Services, Routes, and global configuration, you can consider it as the applicationContext.xml of Spring if you prefer, with Beans=Services

## Annotations

@Bean({name: "", instance: ""})

@Route({url: "", methods: [], swagger: {}})

## Requirements

Node.js >= 14.0.0
