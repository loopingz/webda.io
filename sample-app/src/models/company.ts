import { CoreModel, ModelMapped, ModelRelated } from "@webda/core";
import { Project } from "./project";
import { User } from "./user";

/**
 * @WebdaModel
 */
export class Company extends CoreModel {
  _projects: ModelMapped<Project, "name" | "type">;
  users: ModelRelated<User, "_company">;
}
