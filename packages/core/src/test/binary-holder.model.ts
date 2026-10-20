import { UuidModel } from "@webda/models";
import { BinariesImpl } from "../services/binary.service.js";

/**
 * Collection behavior declared as a `BinariesImpl` subclass.
 *
 * @WebdaBehavior Test/PhotoLike
 */
export class PhotoLike extends BinariesImpl {
  /**
   * Declared so the content-mapper does not generate its own `toJSON`, which would not match the base signature
   * @returns the stored items
   */
  toJSON() {
    return super.toJSON();
  }
}

/**
 * Test-only model (compiled by the content-mapper like production models) holding a `BinariesImpl` subclass
 * attribute. Its `__hydrateBehaviors` always instantiates the behavior, even when the attribute is unset.
 * @WebdaModel WebdaTest/PhotoHolder
 * @WebdaIgnore
 */
export class PhotoHolder extends UuidModel {
  photos: PhotoLike;

  /** @param data - raw initial data */
  constructor(data?: any) {
    super();
    Object.assign(this, { uuid: "holder" }, data);
    (this as any).__hydrateBehaviors?.(data);
  }

  /**
   * Local patch: the stored value is deserialized into the behavior again, as the load path does
   * @param data - partial update
   * @returns this
   */
  async patch(data: any): Promise<this> {
    this.photos = data.photos;
    (this as any).__hydrateBehaviors?.(data);
    return this;
  }
}
