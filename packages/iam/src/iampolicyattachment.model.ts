import { CoreModel } from "@webda/core";
import { isIAMActive } from "./active.js";

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
   * The IAMService authorizer already decided on the operation; refuse when IAM is not running
   * @returns true or the refusal reason
   */
  static canAct(): true | string {
    return isIAMActive() ? true : "IAMService is not running";
  }
}
