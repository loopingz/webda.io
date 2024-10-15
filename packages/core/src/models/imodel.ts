import { CRUDModel } from "../stores/istore";
import { AbstractCoreModel } from "../internal/iapplication";
import { IContextAware } from "../contexts/icontext";

/**
 * Reference to a user model
 */
export interface IUser extends AbstractCoreModel {
  /**
   * Get the user email
   */
  getEmail(): string | undefined;
}

type AbstractCoreModelCRUD = CRUDModel<any>;

/**
 * Event sent by models
 *
 * Events are sent by the model to notify of changes
 * after the changes are done
 *
 * If you need to prevent the change, you should extend the object
 */
export type CoreModelEvents<T = any> = {
  Create: { object_id: string; object: T };
  PartialUpdate: any;
  Delete: { object_id: string };
  Update: { object_id: string; object: T; previous: T };
};
