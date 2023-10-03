# Context

The Context is used to expose Session and globally all information aroudn the current operation.

As we have the ability to execute outside of `http` context the Context is not directly linked to the `http` request.

We have an `OperationContext`. This is the main context that is used to execute an operation. It is created by the `ContextProvider` and is used to execute the operation.


## Extend Context

You can extend it by adding your own ContextProvider:

```
import { ContextProvider, Bean, Service, ContextProviderInfo, OperationContext } from "@webda/core";

@Bean
class MyService extends Service implements ContextProvider {
  /**
   * @override
   */
  resolve(): this {
    super.resolve();
    this.log("INFO", "Registering ArizeContext");
    this.getWebda().registerContextProvider(this);
  }
  /**
   * Return a custom Context
   * @param info
   * @returns
   */
  getContext(info: ContextProviderInfo): OperationContext<any, any> {
    return new MyContext(this.getWebda(), info.http, info.stream);
  }
}
```