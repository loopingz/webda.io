# Throttler

Webda have a util to allow you to parallelize your code and limit the number of parallel execution.

## Usage

```typescript
// To limit to 20 parallel execution
const throtter = new Throttler(20);
for await (const item of items) {
  await throtter.execute(async () => {
    // Do your stuff
  });
}
await throtter.wait();
```
