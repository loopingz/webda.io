import { CoreModel, ModelParent, User as WebdaUser } from "@webda/core";
import { Company } from "./company";

/**
 * @WebdaModel
 */
export class User extends WebdaUser {
  _company: ModelParent<Company>;
  name: string;
}

/**
 * @WebdaModel
 */
export class Computer extends CoreModel {
  _user: ModelParent<User>;
  name: string;
}
