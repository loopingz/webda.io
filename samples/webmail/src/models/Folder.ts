import { CoreModel, ModelLink, OperationContext } from "@webda/core";
import { User } from "./User"; // Assuming User.ts is in the same directory

/**
 * @WebdaModel Folder
 * Represents a mail folder belonging to a user.
 */
export class Folder extends CoreModel {
  name: string; // Name of the folder (e.g., "Inbox", "Sent")
  userId: ModelLink<User>; // Link to the User who owns this folder

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true; // Keep it simple for the tutorial
  }
}
