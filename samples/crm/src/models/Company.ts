import { CoreModel, OperationContext, ModelRelated } from "@webda/core";
import { Contact } from './Contact'; // Forward declaration
import { Opportunity } from './Opportunity'; // Forward declaration

/**
 * @WebdaModel Company
 * @WebdaPlural Companies
 * Represents a company in the CRM.
 */
export class Company extends CoreModel {
  name: string;
  address?: string;
  website?: string;
  phone?: string;

  // Relationships
  // contacts: ModelRelated<Contact, "companyId">; // A company can have multiple contacts
  // opportunities: ModelRelated<Opportunity, "companyId">; // A company can have multiple opportunities


  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}
