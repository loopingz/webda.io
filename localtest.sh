#!/bin/bash

echo "Launching LocalStack"
mkdir -p /tmp/localstack/
rm -rf /tmp/localstack/*
docker run -d --name webda-localstack -v /tmp/localstack/:/var/lib/localstack/ -e DATA_DIR=/var/lib/localstack/ -e SERVICES="s3,sqs,sts,dynamodb,secretsmanager,logs" --rm -p 0.0.0.0:4566:4566 localstack/localstack:latest
echo "Launching ElasticSearch"
docker run -d --name webda-elasticsearch -e cluster.name=webda -e node.name=es1 -e discovery.type=single-node -e xpack.security.enabled=false -p 9200:9200 elasticsearch:8.1.3
echo "Launching MongoDB"
docker run --name webda-mongo -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD=webda.io --name webda-mongo -p 37017:27017 -d mongo

echo "Launching Postgres"
docker run -d --name webda-postgres -v `pwd`/packages/postgres/test/sql:/docker-entrypoint-initdb.d -it -e POSTGRES_PASSWORD=webda.io -e POSTGRES_DB=webda.io -e POSTGRES_USER=webda.io -p 5432:5432 docker.io/library/postgres:17

echo "Launching GCP emulators"
gcloud beta emulators firestore start --host-port=localhost:19090
gcloud beta emulators pubsub start --host-port=localhost:19091

echo "Launching RabbitMQ"
docker run -d -p 5672:5672 --name webda-amqp rabbitmq:3

echo "Launching etcd"
docker run -p 2379:2379 --name webda-etcd -d quay.io/coreos/etcd:latest /usr/local/bin/etcd -name=node1 -advertise-client-urls=http://127.0.0.1:2379 -initial-advertise-peer-urls=http://127.0.0.1:2380 -listen-client-urls=http://0.0.0.0:2379 -listen-peer-urls=http://127.0.0.1:2380 -initial-cluster=node1=http://127.0.0.1:2380
docker run -p 2379:2379 --rm quay.io/coreos/etcd:latest /usr/local/bin/etcd -name=node1 -advertise-client-urls=http://127.0.0.1:2379 -initial-advertise-peer-urls=http://127.0.0.1:2380 -listen-client-urls=http://0.0.0.0:2379 -listen-peer-urls=http://127.0.0.1:2380 -initial-cluster=node1=http://127.0.0.1:2380
