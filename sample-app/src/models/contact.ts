import { Binaries, Binary, CoreModel, Expose, ModelLink, OperationContext } from "@webda/core";
import { User } from "./user";

/**
 * @WebdaModel Contact
 *
 * Another comment
 *
 * @SchemaAdditionalProperties Allow mine
 */
@Expose()
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
  photos: Binaries<{ location: { lat: number; lng: number } }>;

  /**
   * Contact owner
   */
  owner: ModelLink<User>;

  /**
   * Allow all manipulations
   * @param _context
   * @param _action
   * @returns
   */
  canAct(_context: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return Promise.resolve(true);
  }
}
