import { CoreModel, OperationContext } from "@webda/core";
import { ModelRelated } from "@webda/models";
import { NotEnumerable } from "@webda/tsc-esm";
import type { Project } from "./project";
import type { User } from "./user";
import { WEBDA_PLURAL } from "@webda/models";

export type Permission = "PRODUCT_1" | "PRODUCT_2" | "PRODUCT_3";

/**
 * @WebdaPlural Companies
 */
//@Expose()
export class Company extends CoreModel {
  [WEBDA_PLURAL] = "Companies";
  _projects: ModelRelated<Project, Company, "company">;
  users: ModelRelated<User, Company, "company">;
  name: string;
  /**
   * This should not be in the schema
   * @SchemaIgnore
   */
  testNotEnumerable: string;
  /**
   * Test of maps for GraphQL
   */
  mapString?: { [key: string]: string };
  mapAny?: { [key: string]: any };
  mapNumber?: { [key: string]: number };
  mapBoolean?: { [key: string]: boolean };
  mapObject?: { [key: string]: { test: number; b: boolean; status: string } };
  /**
   * @SchemaOptional
   */
  permissions: Permission[];

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}
