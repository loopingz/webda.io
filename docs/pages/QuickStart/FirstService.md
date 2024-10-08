# My first service

To create a service, you need to define a class that inherits from `Service`.

```typescript
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
