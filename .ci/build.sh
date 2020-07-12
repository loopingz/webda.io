#!/bin/bash
PACKAGE=$1

# Check if a custom build exist
case "$1" in
    "@webda/aws")
        # Run local stack
        docker run --name localstack -e SERVICES="s3,dynamodb,secretsmanager,sqs,logs,elasticsearch" -d -p 4567-4600:4567-4600 localstack/localstack
        # Wait for local stack
        echo "Waiting for LocalStack to be Ready"; while :; do docker logs localstack 2>&1 | grep Ready > /dev/null; e=$?; if [ $e -eq 0 ]; then break; fi; sleep 1; done
    *)
        # Default build
        lerna run test --scope $PACKAGE
esac