import { BelongTo, UuidModel } from "@webda/models";
import type { Project } from "./Project.model.js";

/**
 * A task to do in a project
 */
export class Task extends UuidModel {
  /**
   * What needs to be done
   * @minLength 1
   * @maxLength 200
   */
  title!: string;

  /**
   * Whether the task is finished
   */
  done!: boolean;

  /**
   * Project the task belongs to; deleting the project deletes its tasks
   */
  project!: BelongTo<Project>;
}
