import { OneToMany, UuidModel } from "@webda/models";
import type { Task } from "./Task.model.js";

/**
 * A project groups tasks
 */
export class Project extends UuidModel {
  /**
   * Project name
   * @minLength 1
   * @maxLength 100
   */
  name!: string;

  /**
   * Tasks of the project
   */
  tasks!: OneToMany<Task, Project, "project">;
}
