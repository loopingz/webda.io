import { CoreModel, type IOperationContext } from "@webda/core";
import type { FlowError, TaskOptions } from "../graph.js";
import { canReadWorkflow } from "./workflowinstance.model.js";

/**
 * Status of a task attempt
 */
export type WorkflowTaskStatus = "PENDING" | "RUNNING" | "SUCCESS" | "ERROR" | "CANCELLED";

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
   * Launcher and system may read, writes go through the service only
   * @param context - the caller
   * @param action - the action
   * @returns true when allowed, the reason otherwise
   */
  canAct(context: IOperationContext, action: string): string | boolean {
    return canReadWorkflow(context, action, this.launcherId);
  }
}

export { WorkflowTask };
