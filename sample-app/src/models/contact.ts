import { CoreModel } from "@webda/core";

/**
 * @WebdaModel Contact
 *
 * Another comment
 *
 * @SchemaAdditionalProperties Allow mine
 */
export default class Contact extends CoreModel {
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
   * @SchemaIgnore
   */
  custom: string;
  /**
   * To indicate a property that will be set by server,
   * similar to @SchemaOptional
   *
   * @readOnly
   */
  readonly: number;
  /**
   * Useful to auto complete on the creation side without
   * forcing UI to push the attribute
   *
   * @SchemaOptional
   */
  optional: string;
}
