import { Bean, Cron, OperationContext, Service, Operation } from "@webda/core";

/** Simple bean service for testing lifecycle and cron scheduling. */
@Bean
export class BeanService extends Service {
  /** No-op test method. */
  test() {}

  /** Cron job that runs every minute. */
  @Cron("* * * * *")
  async cron() {}
}

/** Bean that is not a Service subclass (intentionally invalid for testing). */
@Bean
export class SampleAppBadBean {
  /** Stop stub. */
  async stop() {}
}

/** Extended bean service with exposed operations. */
@Bean
export class SampleAppGoodBean extends BeanService {
  /** Operation that receives a project ID. */
  @Operation()
  operation(projectId: string) {}

  /** Operation returning a numeric value. */
  @Operation()
  async operation2(): Promise<number> {
    return 123;
  }

  /** Override of the base test method. */
  test() {}
}
