#!/bin/bash

echo "Launching LocalStack"
mkdir -p /tmp/localstack/
rm -rf /tmp/localstack/*
docker run -it --name webda-localstack  -v /tmp/localstack/:/tmp/localstack/ -e DATA_DIR=/tmp/localstack/ -e SERVICES="iam,s3,dynamodb,secretsmanager,sqs,logs,elasticsearch,cloudformation,route53,apigateway,sns,ses" --rm -p 0.0.0.0:4567-4600:4567-4600 -p 0.0.0.0:8080:28080 localstack/localstack:0.11.4

echo "Launching ElasticSearch"

echo "Launching MongoDB"
docker run -it -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD=webda.io --name webda-mongo -p 27017:37017

echo "Launching Postgres"
docker run --name webda-postgres -it -e POSTGRES_PASSWORD=testor 