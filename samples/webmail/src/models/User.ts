import { CoreModel, OperationContext } from "@webda/core";

/**
 * @WebdaModel User
 * Represents a user in the webmail system.
 */
export class User extends CoreModel {
  email: string; // User's email address (unique identifier)
  name: string;  // User's display name
  // Add password handling in a real app (e.g., hashed password field)
  // For simplicity, we're omitting password complexity here.

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    // In a real application, implement proper access control.
    // For this tutorial, we allow all actions.
    return true;
  }
}
