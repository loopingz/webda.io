# Testing your application

We do not have a testing framework built into the application, but you can use the following tools to test your application: `vitest`, `bun`, `mocha`.

We have done some abstraction based on the great work from `@testdeck`, you can create your test with:

```typescript
import { suite, test, WebdaTest } from "@webda/core";

@suite
class MyTest extends WebdaTest {
  @test
  async "Test something"() {
    // Your test here
  }
}
```
