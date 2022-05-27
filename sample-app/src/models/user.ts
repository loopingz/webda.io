import { CoreModel, ModelParent } from "@webda/core";
import { Company } from "./company";

/**
 * @WebdaModel
 */
export class User extends CoreModel {
  _company: ModelParent<Company>;
  name: string;
}
