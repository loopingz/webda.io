import { Operation, RestParameters, Service, useContext, useLog } from "@webda/core";

/**
 * An invoice created by billing
 */
export interface Invoice {
  /**
   * Invoice id
   */
  id: string;
  /**
   * Order the invoice is for
   */
  order: string;
  /**
   * Amount in cents
   */
  amount: number;
  /**
   * Application that asked for the invoice, as seen by billing
   */
  createdBy: string;
}

/**
 * Billing application: creates invoices, protected by IAM
 *
 * @WebdaModda
 */
export class Billing extends Service {
  /**
   * Create an invoice, only callable by an application allowed by IAM
   * @param order - the order id
   * @param amount - the amount in cents
   * @returns the invoice
   */
  @Operation<RestParameters>({
    id: "Invoices.Create",
    rest: { method: "post", path: "/invoices" },
    description: "Create an invoice"
  })
  async createInvoice(order: string, amount: number): Promise<Invoice> {
    // The OIDCVerifier turned the Bearer token into an application session
    const application = useContext().getSession()?.application;
    const createdBy = application ? `app:${application.principal}` : "unknown";
    useLog("INFO", `Invoice for order ${order} requested by ${createdBy} (issuer ${application?.issuer})`);
    return { id: `inv-${Date.now().toString(36)}`, order, amount, createdBy };
  }
}
