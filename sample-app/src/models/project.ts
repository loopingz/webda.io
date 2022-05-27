import { CoreModel, ModelParent } from "@webda/core";
import { Company } from "./company";

/**
 * @WebdaModel
 */
export class Project extends CoreModel {
  _company: ModelParent<Company>;
  name: string;
  type: string;
  uuid: string;
}
