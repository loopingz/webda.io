import { CoreModel, ModelLink, OperationContext } from "@webda/core";
import { Company } from "./Company";
import { User } from "./User";

/**
 * @WebdaModel Contact
 * Represents an individual contact in the CRM.
 */
export class Contact extends CoreModel {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string; // Job title

  companyId?: ModelLink<Company>; // Link to the company this contact belongs to
  assignedToUserId?: ModelLink<User>; // Link to the CRM user responsible for this contact

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}
