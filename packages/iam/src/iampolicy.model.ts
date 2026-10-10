import { Model, WEBDA_PRIMARY_KEY } from "@webda/models";
import { isIAMActive } from "./active.js";
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
   * The IAMService authorizer already decided on the operation; refuse when IAM is not running
   * @returns true or the refusal reason
   */
  static canAct(): true | string {
    return isIAMActive() ? true : "IAMService is not running";
  }
}
