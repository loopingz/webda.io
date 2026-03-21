import { Bean, Cron, OperationContext, Service, Operation } from "@webda/core";

@Bean
export class BeanService extends Service {
  test() {}

  @Cron("* * * * *")
  async cron() {}
}

@Bean
export class SampleAppBadBean {
  async stop() {}
}

@Bean
export class SampleAppGoodBean extends BeanService {
  @Operation()
  operation(projectId: string) {}
  @Operation()
  async operation2(): Promise<number> {
    return 123;
  }
}
