import { Workflow } from "../workflow.js";

/** Flows in a sub-directory: their typed calls import the services through `../`. */
export class AuditFlows extends Workflow {
  /**
   * Notify an audit
   * @param to - recipient
   * @returns nothing
   */
  async notify(to: string) {
    await NotifyService.Send({ to });
  }
}
