import { Binaries, Binary, CoreModel, OperationContext, User as WebdaUser } from "@webda/core";
import { ModelLink, ModelParent, ModelRelated } from "@webda/models";
import { Company } from "./company";
import Contact from "./contact";

/**
 *
 */
//@Expose()
export class User extends WebdaUser {
  _company: ModelParent<Company>;
  name: string;
  profilePicture: Binary<{ width: number; height: number }>;
  images: Binaries;
  computers: ModelRelated<Computer, User, "_user">;
  /**
   * Map of favorites contacts
   */
  contacts: ModelRelated<Contact, User, "owner">;

  attributePermission(key: string, value: any, mode: "READ" | "WRITE", context?: OperationContext) {
    return value;
  }

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}

/**
 *
 */
//@Expose()
export class Computer extends CoreModel {
  _user: ModelParent<User>;
  _loanTo: ModelLink<User>;
  name: string;
}
