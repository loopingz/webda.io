import { CoreModel, ModelLink, OperationContext } from "@webda/core";
import { Company } from "./Company";
import { User } from "./User";
import { Contact }from "./Contact";

export type OpportunityStage = "Prospecting" | "Qualification" | "Proposal" | "Closing" | "Won" | "Lost";

/**
 * @WebdaModel Opportunity
 * Represents a sales opportunity.
 */
export class Opportunity extends CoreModel {
  name: string;
  stage: OpportunityStage;
  amount: number;
  closeDate: Date; // Expected close date

  companyId: ModelLink<Company>; // Link to the company this opportunity is for
  primaryContactId?: ModelLink<Contact>; // Optional: main contact for this opportunity
  assignedToUserId: ModelLink<User>; // Link to the CRM user responsible

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}
