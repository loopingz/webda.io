# @webda/shell module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

This is the configuration interface, deployment interface for the project [Webda](http://github.com/loopingz/webda.git)

[http://webda.io](http://webda.io)

Check our video presentation on [Youtube](https://www.youtube.com/playlist?list=PLfn1MAL4_e7ERdqj9rWlmEkK5gMkL4bKI)

## Install

```
npm install @webda/shell --save-dev
# OR
yarn add --dev @webda/shell
```

#### Configuration

You'll get the configuration UI for your project

```
# To avoid opening browser
webda config --no-open

# Display the configuration for a specific deployment
webda config -d deploymentName

# Export the configuration for a specific deployment to a file
webda config -d deploymentName export.json
```

#### Serve the current project

This will load the Webda framework and run your project with it on port 18080

```
webda serve
```

You can serve with a specific deployment configuration by adding the deployment name

```
webda -d deploymentName serve
```

#### Debug the current project

```
webda debug
```

You can debug with a specific deployment configuration by adding the deployment name

```
webda -d deploymentName debug
```

It will serve the project on port 18080 and restart the server on any changes made on the folder files
If the project has a tsconfig.json, then `webda debug` will launch the typescript compiler and restart server everytime the compilation process finishes with success.

#### Deploy

First you need to create a deployment, from the configuration UI

Then just use the Deploy button on the UI or with webda client :

```
webda -d deploymentName deploy
```

#### Generate Swagger/Postman configuration

If you use Amazon we expose a way for you to get the Postman configuration of your API using AWS

```
webda -d deploymentName openapi myOpenApiDocs.json
```

#### Only redeploy Lambda code on AWS

```
webda -d deploymentName deploy lambda
```

## Requirements

Node.js >= 16.0.0

## Licence

LGPL 3.0

<!-- README_FOOTER -->
## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://arize.com/hubfs/arize/brand/arize-logomark-1.png" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://loopingz.com/images/logo.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://tellae.fr/" width="200">](https://tellae.fr)
