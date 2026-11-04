/**
 * The controls of the workflow engine, called by the WorkflowInstance actions
 */
export interface WorkflowControls {
  /**
   * Cancel an instance, its live tasks and its awaited children
   * @param uuid - the instance uuid
   */
  cancelInstance(uuid: string): Promise<void>;
  /**
   * Restart a failed instance from its failed task
   * @param uuid - the instance uuid
   */
  retryInstance(uuid: string): Promise<void>;
  /**
   * Move an instance to another version of its flow
   * @param uuid - the instance uuid
   * @param version - the target version, the latest registered when undefined
   */
  migrateInstance(uuid: string, version?: string): Promise<void>;
  /**
   * Role needed to write a stored workflow
   * @returns the role
   */
  getStoredWorkflowRole(): string;
}

/**
 * The WorkflowService serving the controls
 */
let controls: WorkflowControls | undefined;

/**
 * Set the WorkflowService serving the instance actions (the configured one, at resolve)
 * @param service - the service
 */
export function setWorkflowControls(service: WorkflowControls | undefined): void {
  controls = service;
}

/**
 * The WorkflowService serving the instance actions
 * @returns the service
 * @throws Error when no WorkflowService is configured
 */
export function useWorkflowControls(): WorkflowControls {
  if (!controls) {
    throw new Error("No WorkflowService is configured");
  }
  return controls;
}
