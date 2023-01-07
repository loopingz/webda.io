import { CoreModel, ModelLinked, ModelMapper } from "@webda/core";
import { Project } from "./project";
import { User } from "./user";

/**
 * @WebdaModel
 */
export class Company extends CoreModel {
  _projects: ModelMapper<Project, "name" | "type">;
  users: ModelLinked<User>;
}
