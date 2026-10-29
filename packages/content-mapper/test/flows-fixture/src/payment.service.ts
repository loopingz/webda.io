import { Operation, OperationContext, Service } from "./runtime.js";

/** A payment. */
export interface Receipt {
  ok: boolean;
}

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

  /**
   * Refund a payment, the context is not part of the input
   * @param uuid - the order
   * @param context - the operation context
   * @param reason - why
   * @returns the receipt
   */
  @Operation()
  async refund(uuid: string, context: OperationContext, reason?: string): Promise<Receipt> {
    return { ok: !!uuid && !!context && reason !== "" };
  }

  /**
   * Not an operation
   * @returns nothing
   */
  async helper(): Promise<void> {}
}

/** Notifications. */
export class NotifyService extends Service {
  /**
   * Send a notification
   * @param to - recipient
   */
  @Operation()
  async send(to: string): Promise<void> {
    void to;
  }
}
