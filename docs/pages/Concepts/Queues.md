# Queues

Webda offer an abstraction to queue system.

It has a `worker` mechanism that is a queue consumer.
As queue systems like SQS can return multiple messages at once, you can define
if you want to process them in parallel or serial