import { CoreModel } from "@webda/core";

/**
 * @WebdaModel
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
}
