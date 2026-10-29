import { Action, CoreModel, type IOperationContext } from "@webda/core";
import { useWorkflowControls } from "../hooks.js";
import type { FlowDefinitionData, FlowError, Journal } from "../graph.js";

/**
 * Status of a workflow instance
 */
export type WorkflowInstanceStatus = "RUNNING" | "WAITING" | "SUCCESS" | "ERROR" | "CANCELLED";

/**
 * Who launched a workflow: the steps run as this identity
 */
export interface WorkflowLauncher {
  /**
   * User id of the launcher
   */
  userId?: string;
  /**
   * Ident used by the launcher to log in
   */
  identId?: string;
  /**
   * Launched by the system
   */
  system?: boolean;
}

/**
 * Actions allowed to the launcher of a workflow: reads, signals and the controls
 */
const LAUNCHER_ACTIONS = ["get", "query", "signal", "cancel", "retry", "migrate"];

/**
 * Whether a caller may read or control an object launched by `launcherId`
 * @param context - the caller
 * @param action - the action
 * @param launcherId - user id of the launcher
 * @returns true when allowed, the reason otherwise
 */
export function canReadWorkflow(context: IOperationContext, action: string, launcherId?: string): string | boolean {
  if (context.isGlobalContext()) {
    return true;
  }
  if (!LAUNCHER_ACTIONS.includes(action)) {
    return "Workflows are written through the WorkflowService only";
  }
  const userId = context.getCurrentUserId();
  if (!userId || userId !== launcherId) {
    return "Only the launcher can read a workflow";
  }
  return true;
}

/**
 * A running (or finished) flow: its pinned definition, input and journal of task outcomes
 *
 * @WebdaModel
 * @WebdaPlural WorkflowInstances
 */
export default class WorkflowInstance extends CoreModel {
  /**
   * Flow id: the operation id launching the flow
   */
  flowId: string;
  /**
   * Version of the pinned definition
   */
  version: string;
  /**
   * The definition the instance runs, pinned at launch
   */
  definition: FlowDefinitionData;
  /**
   * Flow input, by parameter name
   */
  input: Record<string, any>;
  /**
   * Outcomes of the finished tasks, by task key
   */
  journal: Journal;
  /**
   * Current status
   */
  status: WorkflowInstanceStatus;
  /**
   * Identity the steps run as
   */
  launcher: WorkflowLauncher;
  /**
   * Flow output, once SUCCESS
   */
  output?: any;
  /**
   * Uncaught error, once ERROR
   */
  error?: FlowError;
  /**
   * Revision of the instance, incremented by every write (compare-and-set)
   */
  revision: number;
  /**
   * Parent instance and task key of a child flow
   */
  parent?: { instance: string; key: string };
  /**
   * Creation time (ms)
   */
  createdAt: number;
  /**
   * Last update time (ms)
   */
  updatedAt: number;

  /**
   * Launcher and system may read, writes go through the service only
   * @param context - the caller
   * @param action - the action
   * @returns true when allowed, the reason otherwise
   */
  canAct(context: IOperationContext, action: string): string | boolean {
    return canReadWorkflow(context, action, this.launcher?.userId);
  }

  /**
   * Cancel the instance, its live tasks and the children it waits on
   */
  @Action({ rest: { method: "POST" } })
  async cancel(): Promise<void> {
    await useWorkflowControls().cancelInstance(this.uuid);
  }

  /**
   * Restart a failed instance from its failed task, keeping the outcomes before it
   */
  @Action({ rest: { method: "POST" } })
  async retry(): Promise<void> {
    await useWorkflowControls().retryInstance(this.uuid);
  }

  /**
   * Move a running instance to another version of its flow
   * @param version - the target version, the latest registered when omitted
   */
  @Action({ rest: { method: "POST" } })
  async migrate(version?: string): Promise<void> {
    await useWorkflowControls().migrateInstance(this.uuid, version);
  }
}

export { WorkflowInstance };
