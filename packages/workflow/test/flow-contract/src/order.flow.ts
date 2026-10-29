import { Cron, Random, Sleep, Wait, Workflow } from "../../../src/authoring.js";

/** Order flows, compiled by the contract spec. */
export class OrderFlows extends Workflow {
  /**
   * Reconcile the orders
   * @param full - full reconciliation
   * @returns a summary
   */
  @Cron("0 3 * * *", "Nightly reconciliation", { full: false })
  async reconcile(full: boolean) {
    const orders = await Workflow.Call<{ uuid: string; amount: number }[]>("Order.Query", { q: "status = 'PENDING'" });
    const started = await Date.Now();
    let refused = 0;
    for (const o of orders) {
      try {
        const receipt = await PaymentService.Capture({ uuid: o.uuid, amount: o.amount }, { retries: 3 });
        if (!receipt.ok) {
          throw `Capture of ${o.uuid} refused`;
        }
      } catch (e) {
        refused = refused + 1;
        await Wait.ForEvent("manual-review", { key: o.uuid, timeout: "7d" });
      } finally {
        await Sleep("1s");
      }
    }
    const ids = await Workflow.Parallel(orders, o => Random.Uuid(), { concurrency: 2 });
    const both = await Promise.all([Random.Number(), OrderFlows.Archive({ since: started })]);
    await Workflow.Start(OrderFlows.Archive, { since: started });
    return { count: orders.length, refused, full, ids, archived: both[1], label: full ? "full" : `${started}` };
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
