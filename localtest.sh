#!/bin/bash

echo "Launching LocalStack"
mkdir -p /tmp/localstack/
rm -rf /tmp/localstack/*
docker run -it --name webda-localstack  -v /tmp/localstack/:/tmp/localstack/ -e DATA_DIR=/tmp/localstack/ -e SERVICES="iam,s3,dynamodb,secretsmanager,sqs,logs,elasticsearch,cloudformation,route53,apigateway,sns,ses" --rm -p 4567-4600:4567-4600 -p 8080:28080 localstack/localstack:0.11.4

echo "Launching ElasticSearch"
