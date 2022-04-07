import { Bean, Route, Service, ServiceParameters } from "@webda/core";

/**
 * @WebdaModda
 */
class LaterExportService extends Service {}

/**
 * @WebdaModda
 */
class NotExportService extends Service {}

/**
 * @WebdaModda
 */
export class NotExtendingService {}

/**
 * @WebdaDeployer
 */
export class NotExtendingDeployer {}

@Bean
export class BadBean {}

export class BadBeanFromRoute {
  @Route("/test")
  test() {}
}

/**
 * Check for the subdefinition within bean
 */
interface GoodBeanSubDefinition {
  toto: string;
  num: number;
}

class GoodBeanParameter extends ServiceParameters {
  subdefinition: GoodBeanSubDefinition;
}
/**
 * To verify that error are thrown when we cannot create schema
 */
@Bean
export class GoodBean extends Service<GoodBeanParameter> {}

export { LaterExportService };
