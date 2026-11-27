# Test your application

Choose tests at the level of behavior you want to verify. Webda's test helpers work with an external test runner;
they provide application setup and isolation rather than replacing the runner.

| Approach                      | Use it for                                                         | Start here                                           |
| ----------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| Unit tests                    | Pure domain behavior with small, explicit inputs                   | Your project's test runner                           |
| Application and service tests | Models, services, stores, and their configuration working together | [Application test harness](./Modules/test/README.md) |
| Fixture-based tests           | Repeatable data, including related model graphs                    | [Mock data generation](./Modules/mock/README.md)     |
| API integration tests         | Requests through the interface used by your clients                | [Expose](./Expose/index.md)                          |

## Run the project's tests

Generated applications include a test script. Run it from the application directory:

```shell
npm test
```

Use your test runner's filtering options for a focused suite. Keep assertions about behavior and permissions close
to the model or service they exercise; add transport-level tests for the HTTP, GraphQL, or other contracts clients use.

## Boot an application for tests

Use `WebdaApplicationTest` with the `@webda/test` decorators to set up an application context and configured services.
The [test harness guide](./Modules/test/README.md) includes an example and explains failure-log capture.

## Create repeatable fixtures

Use [`@webda/mock`](./Modules/mock/README.md) for seeded model data and related object graphs.
Choose fixed inputs or seeds for regression tests so a failure can be reproduced.

## Measure performance separately

Use [Benchmark](./Benchmarks.md) for throughput, latency, and resource measurements, and to compare runs.
A passing functional test does not establish a performance baseline.
