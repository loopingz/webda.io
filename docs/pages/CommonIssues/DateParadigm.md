# Dates

Attribute with a Date type are more complex than we think.

`typeof JSON.parse(JSON.stringify(new Date())) === 'string'`

Therefore different backends decide to encode differently:

- MemoryStore and FileStore rely on JSON parser so it is stored and return as ISO8601.
- DynamoDB
- MongoDB
- GCP replace Date instance by Timestamp instance
- Postgresql

We need also to be able to query date range independently from the Store
