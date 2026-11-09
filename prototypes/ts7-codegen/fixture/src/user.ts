import { Model } from "./models.js";
/**
 * User implementation
 */
export class User extends Model {
  /**
   * Name
   */
  name: string = "";
  /**
   * Created at
   */
  createdAt: Date;
  /**
   * Updated at
   */
  updatedAt: Date;
  /**
   * Epoch
   */
  static epoch: Date;
  /**
   * Get display name
   * @returns the display name
   */
  get displayName(): string {
    return this.name.toUpperCase();
  }
  /**
   * Perform broken
   * @returns the resulting number
   */
  broken(): number {
    return "not a number";
  }
}
