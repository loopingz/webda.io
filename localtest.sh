#!/bin/bash

echo "Launching LocalStack"
mkdir -p /tmp/localstack/
rm -rf /tmp/localstack/*
docker run --name webda-localstack -v /tmp/localstack-recent/:/tmp/localstack/ -e DATA_DIR=/tmp/localstack/ -e SERVICES="s3,sqs,sts,dynamodb,secretsmanager,logs" --rm -p 0.0.0.0:4566:4566 localstack/localstack:latest
echo "Launching ElasticSearch"
docker run --name webda-elasticsearch -e cluster.name=webda -e node.name=es1 -e discovery.type=single-node -e xpack.security.enabled=false -p 9200:9200 elasticsearch:8.1.3
echo "Launching MongoDB"
docker run --name webda-mongo -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD=webda.io --name webda-mongo -p 37017:27017

echo "Launching Postgres"
docker run --name webda-postgres -it -e POSTGRES_PASSWORD=testor 

echo "Launching GCP emulators"
gcloud beta emulators firestore start --host-port=localhost:19090
gcloud beta emulators pubsub start --host-port=localhost:19091

echo "Launching RabbitMQ"
docker run -d -p 5672:5672 --name webda-amqp rabbitmq:3