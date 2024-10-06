import { CoreModel } from "./coremodel";
import { RawModel } from "./types";

/**
 * CoreModel with a uuid
 */
export class UuidModel extends CoreModel {
  /**
   * @Generated
   */
  uuid: string;

  /**
   * Ensure a uuid is generated if not present
   */
  load(raw: Partial<RawModel<this>>, relations?: boolean): this {
    raw["uuid"] ??= this.generateUid(raw);

    return super.load(raw, relations);
  }
}
