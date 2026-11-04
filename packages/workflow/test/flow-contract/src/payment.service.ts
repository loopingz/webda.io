import { Operation, Service } from "@webda/core";

/** Payments. */
export class PaymentService extends Service {
  /**
   * Capture a payment
   * @param uuid - the order
   * @param amount - the amount
   * @returns the receipt
   */
  @Operation()
  async capture(uuid: string, amount: number): Promise<{ ok: boolean }> {
    return { ok: uuid !== "" && amount > 0 };
  }
}
