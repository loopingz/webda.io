import { Binaries, Binary, CoreModel, ModelLink } from "@webda/core";
import { User } from "./user";

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
  /**
   * Contact avatar
   */
  avatar: Binary;
  /**
   * Contact photos
   */
  photos: Binaries;

  /**
   * Contact owner
   */
  owner: ModelLink<User>;
}
