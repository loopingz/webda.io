import { Bean, Route, Service, ServiceParameters } from "@webda/core";

/**
 * Later export service implementation
 * @WebdaModda
 */
class LaterExportService extends Service {}

/**
 * Not export service implementation
 * @WebdaModda
 */
class NotExportService extends Service {}

/**
 * Not extending service implementation
 * @WebdaModda
 */
export class NotExtendingService {}

/**
 * Not extending deployer implementation
 * @WebdaDeployer
 */
export class NotExtendingDeployer {}

/**
 * Bad bean implementation
 */
@Bean
export class BadBean {}

/**
 * Bad bean from route implementation
 */
export class BadBeanFromRoute {
  /**
   * Test operation
   */
  @Route("/test")
  test() {}
}

/**
 * Check for the subdefinition within bean
 */
interface GoodBeanSubDefinition {
  /**
   * Toto
   */
  toto: string;
  /**
   * Num
   */
  num: number;
}

/**
 * Configuration parameters for GoodBean
 */
class GoodBeanParameters extends ServiceParameters {
  /**
   * Subdefinition
   */
  subdefinition: GoodBeanSubDefinition;
  /**
   * Subdefinition2
   */
  subdefinition2: GoodBeanSubDefinition;
}
/**
 * To verify that error are thrown when we cannot create schema
 */
@Bean
export class GoodBean extends Service<GoodBeanParameters> {}

export { LaterExportService };

/**
 * Schema test interface
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
 * Schema test2 implementation
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
  /**
   * Unique identifier
   * @readOnly
   */
  uuid: string;
}

/**
 * This service is neither defined as a bean nor a modda
 * So it should just display a warning
 */
export class NoBeanNoModdaService extends Service {}
