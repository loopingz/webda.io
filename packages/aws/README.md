# @webda/aws module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/aws

> AWS integration bundle for Webda — DynamoDB Store, S3 Binary, SQS Queue, CloudWatch Logger, Secrets Manager, Lambda server, Route53, and Lambda/CloudFormation deployers in one package.

## When to use it

- You are deploying a Webda application on AWS (Lambda or EC2/ECS) and need cloud-native backing services.
- You want to swap out `MemoryStore` / `MemoryQueue` / `FileBinary` with AWS-managed equivalents for production.
- You need to deploy your application as a Lambda function or manage infrastructure via CloudFormation.

## Install

```bash
pnpm add @webda/aws
```

## What's inside

### Runtime services

- `DynamoStore` — DynamoDB-backed Store for any Webda model ([source](./src/services/dynamodb.ts))
- `S3Binary` — S3-backed Binary service for file uploads and downloads ([source](./src/services/s3binary.ts))
- `SQSQueue` — SQS-backed Queue for durable task queuing ([source](./src/services/sqsqueue.ts))
- `CloudWatchLogger` — Streams application logs to CloudWatch Logs ([source](./src/services/cloudwatchlogger.ts))
- `SecretsManager` — Resolves configuration parameters from AWS Secrets Manager ([source](./src/services/secretsmanager.ts))
- `Route53` — DNS record management via Route53 ([source](./src/services/route53.ts))
- `LambdaServer` — Adapts incoming Lambda events to Webda's HTTP context ([source](./src/services/lambdaserver.ts))
- `LambdaCaller` — Invokes other Lambda functions as service calls ([source](./src/services/lambdacaller.ts))

### Deployers (shell/build-time)

- `LambdaDeployer` — Packages and deploys the application as an AWS Lambda function ([source](./src/deployers/lambda-entrypoint.ts))
- `CloudFormationDeployer` — Full infrastructure deployment via AWS CloudFormation ([source](./src/deployers/cloudformation.ts))
- `LambdaPackager` — Bundles the application for Lambda deployment ([source](./src/deployers/lambdapackager.ts))

## Quick config example

```json
{
  "services": {
    "userStore": {
      "type": "DynamoStore",
      "model": "MyApp/User",
      "table": "my-app-users",
      "region": "us-east-1"
    },
    "uploadBucket": {
      "type": "S3Binary",
      "bucket": "my-app-uploads",
      "region": "us-east-1"
    },
    "taskQueue": {
      "type": "SQSQueue",
      "queue": "https://sqs.us-east-1.amazonaws.com/123456789/my-tasks"
    }
  }
}
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/aws/`.
- Source: [`packages/aws`](https://github.com/loopingz/webda.io/tree/main/packages/aws)
- Related: [`@webda/core`](../core) for Store, Queue, and Binary base classes; [`@webda/async`](../async) for job orchestration using SQSQueue.

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
