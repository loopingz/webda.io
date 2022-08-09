# Pipeline

A pipeline is a way to consume queue, transform the message and requeue it.
It can be called independently or as a queue consumer.

We are aiming to get it compatible with elastic filebeat pipeline definition format

## Independently

By calling the method

process(input: any, pipelineName?: string) : any;

## As a consumer

By calling

consume()
