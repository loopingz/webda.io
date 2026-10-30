import { CoreModel, type IOperationContext } from "@webda/core";
import type { FlowError, TaskOptions } from "../graph.js";
import { canReadWorkflow } from "./workflowinstance.model.js";

/**
 * Status of a task attempt
 */
export type WorkflowTaskStatus =
  "PENDING" | "RUNNING" | "WAITING_EVENT" | "WAITING_CHILD" | "SUCCESS" | "ERROR" | "CANCELLED";

/**
 * One attempt of a task of a workflow instance
 *
 * @WebdaModel
 * @WebdaPlural WorkflowTasks
 */
export default class WorkflowTask extends CoreModel {
  /**
   * Uuid of the workflow instance
   */
  instance: string;
  /**
   * Task key in the instance journal
   */
  key: string;
  /**
   * Operation id or built-in
   */
  operation: string;
  /**
   * Operation input
   */
  input: any;
  /**
   * Task options, flow defaults included
   */
  options: TaskOptions;
  /**
   * Attempt number, starting at 1
   */
  attempt: number;
  /**
   * Current status
   */
  status: WorkflowTaskStatus;
  /**
   * When the task becomes runnable (ms)
   */
  runAt: number;
  /**
   * Worker holding the lease
   */
  owner?: string;
  /**
   * End of the lease (ms), 0 when free
   */
  leaseUntil: number;
  /**
   * Result of the attempt
   */
  output?: any;
  /**
   * Error of the attempt
   */
  error?: FlowError;
  /**
   * Start of the attempt (ms)
   */
  startedAt?: number;
  /**
   * End of the attempt (ms)
   */
  endedAt?: number;
  /**
   * User id of the instance launcher, for canAct
   */
  launcherId?: string;
  /**
   * Event a `Wait.ForEvent` waits for
   */
  event?: string;
  /**
   * Business key a `Wait.ForEvent` waits for
   */
  eventKey?: string;
  /**
   * Users allowed to signal the wait, besides the launcher and the system
   */
  allow?: string[];
  /**
   * The wait was resolved by a signal: `output` holds its payload
   */
  signaled?: boolean;
  /**
   * Child instance of a `WAITING_CHILD` task
   */
  child?: string;

  /**
   * Launcher and system may read, writes go through the service only
   * @param context - the caller
   * @param action - the action
   * @returns true when allowed, the reason otherwise
   */
  canAct(context: IOperationContext, action: string): string | boolean {
    if (!context.isGlobalContext() && action !== "get" && action !== "query") {
      return "Workflow tasks are written through the WorkflowService only";
    }
    return canReadWorkflow(context, action, this.launcherId);
  }
}

export { WorkflowTask };
