import {
  BinaryMap,
  BinaryMaps,
  CoreModel,
  Expose,
  ModelParent,
  ModelRelated,
  OperationContext,
  User as WebdaUser
} from "@webda/core";
import { Company } from "./company";

/**
 * @WebdaModel
 */
@Expose()
export class User extends WebdaUser {
  _company: ModelParent<Company>;
  name: string;
  profilePicture: BinaryMap<{ width: number; height: number }>;
  images: BinaryMaps;
  computers: ModelRelated<Computer, "_user">;

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
  name: string;
}
