import { CoreModel } from "@webda/core";
import { canActInIAMOperation } from "./active.js";

/**
 * Attachment of a policy to a principal
 *
 * Its operations are always governed by the IAMService: the class allows them only while IAM is enforcing
 * @WebdaModel
 * @WebdaPlural IAMPolicyAttachments
 */
export class IAMPolicyAttachment extends CoreModel {
  /**
   * `user:<uuid>`, `group:<name>`, `authenticated` or `anonymous`
   */
  principal: string;
  /**
   * Name of a configuration or model policy
   */
  policy: string;

  /**
   * @param data - initial data
   */
  constructor(data?: Partial<IAMPolicyAttachment>) {
    super(data);
    if (data) {
      Object.assign(this, data);
    }
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
