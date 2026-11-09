import { CoreModel, OperationContext, Shared } from "@webda/core";
import { ModelRelated } from "@webda/models";
import type { Project } from "./project.model.js";
import type { User } from "./user.model.js";
import { WEBDA_PLURAL } from "@webda/models";

/**
 * Permission type definition
 */
export type Permission = "PRODUCT_1" | "PRODUCT_2" | "PRODUCT_3";

/**
 * Company implementation
 * @WebdaPlural Companies
 */
//@Expose()
export class Company extends CoreModel {
  /**
   * [webda plural]
   */
  [WEBDA_PLURAL] = "Companies";
  /**
   * Projects
   */
  _projects: ModelRelated<Project, Company, "company">;
  /**
   * Users
   */
  users: ModelRelated<User, Company, "company">;
  /**
   * Name
   */
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
  /**
   * Map any
   */
  mapAny?: { [key: string]: any };
  /**
   * Map number
   */
  mapNumber?: { [key: string]: number };
  /**
   * Map boolean
   */
  mapBoolean?: { [key: string]: boolean };
  /**
   * Map object
   */
  mapObject?: { [key: string]: { test: number; b: boolean; status: string } };
  /**
   * Permissions
   * @SchemaOptional
   */
  permissions: Permission[];

  /**
   * Shared with the frontend SDK
   *
   * @param permission - the permission
   * @returns true when the company has it
   */
  @Shared()
  hasPermission(permission: string): boolean {
    return ((this.permissions ?? []) as string[]).includes(permission);
  }

  /**
   * Check whether the given action is allowed (always returns true).
   *
   * @param _ctx - the operation context
   * @param _action - the action to check
   * @returns true
   */
  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}
