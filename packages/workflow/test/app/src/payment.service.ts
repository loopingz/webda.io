import { Operation, Service, WebdaError } from "@webda/core";

/**
 * Payments, configured as `Billing`: flows call `PaymentService.Capture`, the engine resolves it to `Billing.Capture`
 */
export class PaymentService extends Service {
  /**
   * Captures done
   */
  captured: string[] = [];
  /**
   * Notifications sent
   */
  notified: string[] = [];

  /**
   * Capture the payment of an order: order `b` is refused
   * @param uuid - the order
   * @returns the receipt
   */
  @Operation()
  async capture(uuid: string): Promise<{ ok: boolean }> {
    if (uuid === "b") {
      throw new WebdaError.BadRequest(`Payment of ${uuid} refused`);
    }
    this.captured.push(uuid);
    return { ok: true };
  }

  /**
   * Notify an order owner
   * @param to - the owner
   */
  @Operation()
  async notify(to: string): Promise<void> {
    this.notified.push(to);
  }

  /**
   * The pending orders, served as `Order.Query` by the spec
   * @returns the orders
   */
  async orders(): Promise<{ uuid: string; owner: string }[]> {
    return [
      { uuid: "a", owner: "ann" },
      { uuid: "b", owner: "bob" }
    ];
  }
}
