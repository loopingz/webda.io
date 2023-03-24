import { BinaryMap, CoreModel, Expose, ModelParent, OperationContext, User as WebdaUser } from "@webda/core";
import { Company } from "./company";

/**
 * @WebdaModel
 */
@Expose()
export class User extends WebdaUser {
  _company: ModelParent<Company>;
  name: string;
  profilePicture: BinaryMap;
  images: BinaryMap[];

  attributePermission(key: string, value: any, mode: "READ" | "WRITE", context?: OperationContext) {
    return value;
  }

  canAct(_ctx: OperationContext<any, any>, _action: string): Promise<this> {
    return Promise.resolve(this);
  }
}

/**
 * @WebdaModel
 */
export class Computer extends CoreModel {
  _user: ModelParent<User>;
  name: string;
}
