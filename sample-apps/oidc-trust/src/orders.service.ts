import { Operation, RestParameters, Service, ServiceParameters, WebdaError } from "@webda/core";
import { useOIDCClient } from "@webda/oidc";
import type { Invoice } from "./billing.service.js";

/**
 * Parameters of the orders application
 */
export class OrdersParameters extends ServiceParameters {
  /**
   * Public URL of the billing application
   *
   * @default "http://localhost:18082"
   */
  billingUrl: string;

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.billingUrl ??= "http://localhost:18082";
    return this;
  }
}

/**
 * Orders application: checks out an order and asks billing for the invoice
 *
 * @WebdaModda
 */
export class Orders<T extends OrdersParameters = OrdersParameters> extends Service<T> {
  /**
   * Checkout an order: billing is called with a workload token minted by this application
   * @param order - the order id
   * @param amount - the amount in cents
   * @returns the invoice created by billing
   */
  @Operation<RestParameters>({
    id: "Orders.Checkout",
    rest: { method: "post", path: "/checkout" },
    description: "Checkout an order and create its invoice in billing"
  })
  async checkout(order: string, amount: number): Promise<Invoice> {
    // The audience defaults to the url origin: http://localhost:18082
    const res = await useOIDCClient().fetch(`${this.parameters.billingUrl}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order, amount })
    });
    if (!res.ok) {
      throw new WebdaError.HttpError(`Billing answered HTTP ${res.status}: ${await res.text()}`, 502);
    }
    return (await res.json()) as Invoice;
  }
}
