import {
  Binaries,
  Binary,
  CoreModel,
  Expose,
  ModelLink,
  ModelParent,
  ModelRelated,
  ModelsMapped,
  OperationContext,
  User as WebdaUser
} from "@webda/core";
import { Company } from "./company";
import Contact from "./contact";

/**
 * @WebdaModel
 */
@Expose()
export class User extends WebdaUser {
  _company: ModelParent<Company>;
  name: string;
  profilePicture: Binary<{ width: number; height: number }>;
  images: Binaries;
  computers: ModelRelated<Computer, "_user">;
  /**
   * Map of favorites contacts
   */
  contacts: ModelsMapped<Contact, "owner", "firstName" | "lastName" | "age">;

  attributePermission(key: string, value: any, mode: "READ" | "WRITE", context?: OperationContext) {
    return value;
  }

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}

/**
 * @WebdaModel
 */
@Expose()
export class Computer extends CoreModel {
  _user: ModelParent<User>;
  _loanTo: ModelLink<User>;
  name: string;
}
