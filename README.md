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

Even if the framework can do all the steps of deployment, it can also be decoupled to fit inside your classic CI workflow using Github Actions, Bazel, Jenkins, ...

The framework in its latest version moved to a Domain-driven design: design your `Models` and their actions, permissions. For specific behavior that are not Models specific, you can create and use Beans. The framework can then expose everything as REST API, or GraphQL or CommandLine.

## Quickstart

You should checkout our demo project : [link](https://github.com/loopingz/webda.io/sample-app/)

#### Create a project

```
npx @webda/shell init
```

#### Create a new module if you have a multi modules

Inside your project, just launch:

```
yarn new-module
```

#### Create a new service

Inside your package, just launch:

```
yarn new-service
```

#### Create a new model

Inside your package, just launch:

```
yarn new-model
```

#### Run it

```
webda serve
```

Or in debug mode with hot reload

```
webda debug
```

## Documentation

You can find the Javascript documentation on https://docs.webda.io

## Configuration resolution

To ease up the configuration of an application we came up with the following configuration resolution schema.

You have the global configuration for the application, that is override by the deployment configuration, that is override by the local element configuration, and finally, override by the deployment element configuration.

## History

Back in 2014, I had servers running for my own personal use for more than 10 years because I wanted to have few websites and APIs online, but most of the time those servers are sitting and waiting. Then came **Lambda**, really cool feature from AWS, but it was tricky to turn it into a full webserver. That's one of the targets of Webda.

Since AWS became better with nice framework like Amplify or Serverless. Webda stayed useful as it does provide a true framework of development with some vague inspiration from Spring. It does the heavy lifting for you to abstract NoSQL, to abstract the run environment (Lambda or Kubernetes or custom)

The **webda.config.json** contains the configuration of the app, defining Services, Routes, and global configuration, you can consider it as the applicationContext.xml of Spring if you prefer, with Beans=Services

## Requirements

Node.js >= 14.0.0
