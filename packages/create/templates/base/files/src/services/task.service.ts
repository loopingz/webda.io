import { Operation, Service, useLog } from "@webda/core";
import { Task } from "../models/Task.model.js";

/**
 * Parameters of TaskService, set in webda.config.json
 */
export class TaskServiceParameters extends Service.Parameters {}

/**
 * Behaviour spanning several tasks
 *
 * @WebdaModda
 */
export class TaskService<T extends TaskServiceParameters = TaskServiceParameters> extends Service<T> {
  static Parameters = TaskServiceParameters;

  /**
   * Count the open and finished tasks of a project
   * @param project - project uuid
   * @returns task counts
   */
  @Operation()
  async summary(project: string): Promise<{ open: number; done: number }> {
    const { results } = await Task.query("project = ?", [project]);
    const done = results.filter(task => task.done).length;
    useLog("INFO", "Summary of project", project);
    return { open: results.length - done, done };
  }
}
