import { Model } from "./models.js";
export class User extends Model {
  name: string = "";
  createdAt: Date;
  updatedAt: Date;
  static epoch: Date;
  get displayName(): string { return this.name.toUpperCase(); }
  broken(): number { return "not a number"; }
}
