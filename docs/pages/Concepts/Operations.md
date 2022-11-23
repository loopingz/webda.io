# Operations

Defined by the annotation `@Operation` it has:

- Id
- Parameters
- Output

This define what is supposed to be accessible in this application as an operation.

The Operation can be call through several type:

- REST API
- Async Action API
- Slack bot
- WebSockets event

OperationCall is

- Uuid
- Operation
- Parameters
- Output

A `@Route` can be seen as an Operation
