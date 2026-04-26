:::warning Stale — under revision
Parts of this page reference the removed `@webda/shell` package and the
`npx @webda/shell init` flow. The current entry points are `webda` (from
`@webda/core`) and `webdac` (from `@webda/compiler`). For an up-to-date
walkthrough, see [Tutorial-BlogSystem](./Tutorial-BlogSystem/00-Overview).
:::

# My first service

To create a service, you need to define a class that inherits from `Service`.

```typescript title="src/MyService.ts"
class MyServiceParameters extends ServiceParameters {
  /**
   * @param params
   */
  constructor(params) {
    super(params);
  }
}
/**
 *
 */
class MyService<P extends MyServiceParameters> extends Service<P> {
  /**
   * If you want to declare a metric, you can do it here
   */
  declare metrics: {
    myMetric: Metric;
  };
  /**
   * @param params
   */
  loadParameters(params) {
    new MyServiceParameters(params);
  }
}
```
