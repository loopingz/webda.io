import { BinaryMap, CoreModel, Expose, ModelParent, User as WebdaUser } from "@webda/core";
import { Company } from "./company";

/**
 * @WebdaModel
 */
@Expose()
export class User extends WebdaUser {
  _company: ModelParent<Company>;
  name: string;
  images: BinaryMap;
}

/**
 * @WebdaModel
 */
export class Computer extends CoreModel {
  _user: ModelParent<User>;
  name: string;
}
