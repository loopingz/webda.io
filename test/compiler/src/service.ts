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

class GoodBeanParameters extends ServiceParameters {
  subdefinition: GoodBeanSubDefinition;
  subdefinition2: GoodBeanSubDefinition;
}
/**
 * To verify that error are thrown when we cannot create schema
 */
@Bean
export class GoodBean extends Service<GoodBeanParameters> {}

export { LaterExportService };

/**
 * @WebdaSchema
 */
export interface SchemaTest {
  /**
   * Contact firstname
   */
  firstName: string;
  /**
   * Contact lastname
   */
  lastName: string;
  /**
   * Contact type
   */
  type: "PERSONAL" | "PROFESSIONAL";
}

/**
 * @WebdaSchema AnotherSchema
 * @SchemaAdditionalProperties You can add more properties
 */
export class SchemaTest2 {
  /**
   * Contact firstname
   */
  firstName: string;
  /**
   * Contact lastname
   */
  lastName: string;
  /**
   * Contact type
   */
  type: "PERSONAL" | "PROFESSIONAL";
  /**
   * Contact age
   *
   * @minimum 0
   */
  age: number;
}
