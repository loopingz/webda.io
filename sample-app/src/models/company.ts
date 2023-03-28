import { CoreModel, Expose, ModelRelated, ModelsMapped, OperationContext } from "@webda/core";
import { Project } from "./project";
import { User } from "./user";

/**
 * @WebdaPlural Companies
 */
@Expose()
export class Company extends CoreModel {
  _projects: ModelsMapped<Project, "name" | "type">;
  users: ModelRelated<User, "_company">;
  name: string;

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}
