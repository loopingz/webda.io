import { CoreModel, type IOperationContext } from "@webda/core";
import type { TaskOptions } from "../graph.js";
import { useWorkflowControls } from "../hooks.js";

/**
 * A cron launching a stored workflow
 */
export interface StoredWorkflowCron {
  /**
   * Cron expression
   */
  cron: string;
  /**
   * Description
   */
  description?: string;
  /**
   * Flow input, by parameter name
   */
  input?: Record<string, any>;
}

/**
 * A workflow defined at runtime: the same graph as a `.flow.ts` flow, stored as data
 *
 * Saving validates the graph (expressions, statement kinds, operations, `useSystem`); the WorkflowService registers
 * it as the operation `name` and its crons, which run as the user who saved it last.
 *
 * @WebdaModel
 * @WebdaPlural Workflows
 */
export default class Workflow extends CoreModel {
  /**
   * Flow id: the operation launching it
   */
  name: string;
  /**
   * Names of the flow parameters, in order
   */
  params: string[];
  /**
   * JSON schema of the input
   */
  input: object;
  /**
   * The statements ({@link Stmt}[])
   */
  body: any[];
  /**
   * Default options of every task
   */
  options?: TaskOptions;
  /**
   * Crons launching the flow
   */
  crons?: StoredWorkflowCron[];
  /**
   * {@link flowVersion} of the graph, computed on save
   */
  version: string;
  /**
   * User id of the last save: the identity of its crons
   */
  updatedBy?: string;

  /**
   * The system always; any authenticated user reads; writes need the stored workflow role
   * @param context - the caller
   * @param action - the action
   * @returns true when allowed, the reason otherwise
   */
  async canAct(context: IOperationContext, action: string): Promise<string | boolean> {
    if (context.isGlobalContext()) return true;
    if (!context.getCurrentUserId()) return "Authentication required";
    if (action === "get" || action === "query") return true;
    let role = "workflow-admin";
    try {
      role = useWorkflowControls().getStoredWorkflowRole();
    } catch {
      // No WorkflowService: the default role
    }
    const roles: string[] =
      context.getSession()?.roles ?? ((await context.getCurrentUser()) as any)?.getRoles?.() ?? [];
    return roles.includes(role) || `Role ${role} required`;
  }
}

export { Workflow };
