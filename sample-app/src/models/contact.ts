import { CoreModel } from "@webda/core";

/**
 * @WebdaModel
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
}
