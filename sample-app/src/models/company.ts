import { CoreModel, ModelLinked, ModelMap } from "@webda/core";
import { Project } from "./project";
import { User } from "./user";

/**
 * @WebdaModel
 */
export class Company extends CoreModel {
  _projects: ModelMap<Project, "uuid", "name" | "type">;
  users: ModelLinked<User>;
}
