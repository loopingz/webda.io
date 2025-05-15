import { Model } from "./model";
import { RawModel } from "../internal/iapplication";
import { randomUUID } from "crypto";

/**
 * CoreModel with a uuid
 */
export class UuidModel extends Model {
  declare PrimaryKey: "uuid";
  /**
   * @Generated
   */
  uuid: string;

  /**
   * Generate a new uuid
   */
  generateUid(_raw: Partial<RawModel<this>>): string {
    return randomUUID();
  }

  /**
   * Ensure a uuid is generated if not present
   */
  unserialize(raw: Partial<RawModel<this>>): this {
    raw["uuid"] ??= this.generateUid(raw);
    return super.unserialize(raw);
  }
}
