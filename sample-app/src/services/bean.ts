import { Bean, Cron, OperationContext, Service, Operation } from "@webda/core";

@Bean
export class BeanService extends Service {
  test() {}

  @Cron("* * * * *")
  async cron() {}
}

@Bean
export class SampleAppBadBean {
  @Operation()
  operation(context: OperationContext<{ projectId: string }>) {}

  async stop() {}
}

@Bean
export class SampleAppGoodBean extends BeanService {
  @Operation()
  operation(context: OperationContext<{ projectId: string }>) {}
  @Operation()
  operation2(context: OperationContext) {}
}
