import { CoreModel, ModelLink, OperationContext } from "@webda/core";
import { User } from "./User";
import { Folder } from "./Folder";

/**
 * @WebdaModel Email
 * Represents an email message.
 */
export class Email extends CoreModel {
  subject: string;
  body: string;
  from: string; // Email address of the sender
  to: string[]; // Array of email addresses of recipients
  timestamp: Date;
  read: boolean;

  userId: ModelLink<User>; // Link to the User who owns this email
  folderId: ModelLink<Folder>; // Link to the Folder this email resides in

  // Consider adding cc, bcc, attachments etc. for a more complete model.

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true; // Keep it simple
  }
}
