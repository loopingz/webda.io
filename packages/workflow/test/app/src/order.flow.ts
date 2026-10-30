import { Cron, Wait, Workflow } from "../../../lib/authoring.js";

/**
 * The example of the issue: every call is typed, `Workflow.Call` stands for the model operation
 */
export class OrderFlows extends Workflow {
  /**
   * Capture the pending orders, a refused one waits for a manual review
   * @param full - full reconciliation
   * @returns the number of orders
   */
  @Cron("0 3 * * *", "Nightly reconciliation", { full: false })
  @Cron("0 4 * * 0", "Weekly full reconciliation", { full: true })
  async reconcile(full: boolean) {
    const orders = await Workflow.Call<{ uuid: string; owner: string }[]>("Order.Query", { full });
    const started = await Date.Now();
    for (const o of orders) {
      try {
        await PaymentService.Capture({ uuid: o.uuid }, { retries: 3, backoff: "exponential", timeout: "30s" });
      } catch (e) {
        await Wait.ForEvent("manual-review", { key: o.uuid, timeout: "7d" });
      }
    }
    await Workflow.Parallel(orders, order => PaymentService.Notify({ to: order.owner }), { concurrency: 5 });
    const archived = await OrderFlows.Archive({ since: started });
    return { count: orders.length, archived: archived === started };
  }

  /**
   * Archive the orders
   * @param since - start time
   * @returns the start time
   */
  async archive(since: number) {
    return since;
  }
}
