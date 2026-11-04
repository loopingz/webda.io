import { Cron, Random, Sleep, Wait, Workflow } from "./workflow.js";

/** Order flows. */
export class OrderFlows extends Workflow {
  /**
   * Reconcile the orders
   * @param full - full reconciliation
   * @returns the number of orders
   */
  @Cron("0 3 * * *", "Nightly reconciliation", { full: false })
  @Cron("0 4 * * 0", "Weekly full reconciliation", { full: true })
  async reconcile(full: boolean) {
    const orders = await Workflow.Call<{ uuid: string; owner: string; amount: number }[]>("Order.Query", {
      q: "status = 'PENDING'"
    });
    const started = await Date.Now();
    for (const o of orders) {
      try {
        const receipt = await PaymentService.Capture(
          { uuid: o.uuid, amount: o.amount },
          { retries: 3, timeout: "30s" }
        );
        if (!receipt.ok) {
          throw { code: "Refused", message: `Capture of ${o.uuid} refused` };
        }
      } catch (e) {
        await Wait.ForEvent("manual-review", { key: o.uuid, timeout: "7d" });
      }
    }
    await Workflow.Parallel(orders, o => NotifyService.Send({ to: o.owner }), { concurrency: 5 });
    await OrderFlows.Archive({ since: started });
    await Sleep("1h");
    const id = await Random.Uuid();
    return { count: orders.length, full, id };
  }

  /**
   * Archive the orders
   * @param since - start time
   * @returns the archive id
   */
  async archive(since: number) {
    await Workflow.Start(OrderFlows.Archive, { since: since - 1 });
    return since;
  }
}
