import { Model, WEBDA_PRIMARY_KEY } from "@webda/models";
import { canActInIAMOperation } from "./active.js";
import type { PolicyStatement } from "./compiler.js";

/**
 * IAM policy managed at runtime
 *
 * Its operations are always governed by the IAMService: the class allows them only while IAM is enforcing
 * @WebdaModel
 * @WebdaPlural IAMPolicies
 */
export class IAMPolicy extends Model {
  /**
   * Definition of the primary key
   */
  [WEBDA_PRIMARY_KEY] = ["name"] as const;
  /**
   * Unique policy name
   */
  name: string;
  /**
   * Human description
   */
  description?: string;
  /**
   * Statements of the policy
   */
  statements: PolicyStatement[];

  /**
   * @param data - initial data
   */
  constructor(data?: Partial<IAMPolicy>) {
    super();
    Object.assign(this, data ?? {});
    this.statements ??= [];
  }

  /**
   * Allowed only inside an operation the IAMService authorizer allowed: any other path (no IAM running, a context
   * that did not go through `callOperation`, such as GraphQL CRUD) is refused
   * @param context - the caller context
   * @returns true or the refusal reason
   */
  static canAct(context?: any): true | string {
    return canActInIAMOperation(context);
  }
}
