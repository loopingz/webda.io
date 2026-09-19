import { UuidModel } from "./runtime.js";

/** A second model, so relations resolve across files. */
export class Team extends UuidModel {
  label: string = "";
  createdAt: Date;
}
