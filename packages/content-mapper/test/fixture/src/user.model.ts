import { ManyToOne, ModelLink, ModelRelated, OneToMany, UuidModel } from "./runtime.js";
import type { Team } from "./team.model.js";

/** Model exercising every coercion kind. */
export class User extends UuidModel {
  name: string = "";
  createdAt: Date;
  team: ManyToOne<Team>;
  reviewer: ModelLink<Team>;
  memberships: OneToMany<Team>;
  peers: ModelRelated<Team>;
  static epoch: Date;
  get slug(): string {
    return this.name.toLowerCase();
  }
}
