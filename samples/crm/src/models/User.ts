import { CoreModel, OperationContext } from "@webda/core";

/**
 * @WebdaModel User
 * Represents a user in the CRM system.
 */
export class User extends CoreModel {
  email: string;
  name: string;

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}
