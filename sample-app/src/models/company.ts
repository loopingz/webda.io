import { CoreModel, Expose, ModelRelated, ModelsMapped, OperationContext } from "@webda/core";
import { Project } from "./project";
import { User } from "./user";

export type Permission = "PRODUCT_1" | "PRODUCT_2" | "PRODUCT_3";

/**
 * @WebdaPlural Companies
 */
@Expose()
export class Company extends CoreModel {
  _projects: ModelsMapped<Project, "_company", "name" | "type">;
  users: ModelRelated<User, "_company">;
  name: string;
  /**
   * @SchemaOptional
   */
  permissions: Permission[];

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}
