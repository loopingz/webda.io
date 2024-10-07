import { Attributes, FilterAttributes, Methods, NotEnumerable } from "@webda/tsc-esm";
import { AsyncEventUnknown } from "../events/asynceventemitter";
import { Context } from "../contexts/icontext";
import { CRUDModel } from "../stores/istore";
import { CoreModelFullDefinition, IModel } from "../application/iapplication";
import { IContextAware, canUpdateContext } from "../contexts/icontext";
import { useContext } from "../contexts/execution";

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
 * Define a object that act like a Webda Model
 */
export abstract class AbstractCoreModel implements IAttributeLevelPermissionModel, AbstractCoreModelCRUD, IModel {
  /**
   *
   */
  abstract checkAct(context: Context, action: string);
  isDeleted(): boolean {
    throw new Error("Method not implemented.");
  }
  Events: AsyncEventUnknown;
  @NotEnumerable
  private __context: Context[] = [useContext()];
  /**
   * Contain the context the object was loaded with
   */
  @NotEnumerable
  set context(context: Context) {
    if (!canUpdateContext()) {
      throw new Error("Cannot update context, you have to use runWithContext(() => {}, [myObject])");
    }
    if (context === undefined) {
      if (this.__context.length <= 1) {
        throw new Error("Cannot remove context");
      }
      this.__context.pop();
    } else {
      this.__context.push(context);
    }
  }
  get context(): Context {
    return this.__context[this.__context.length - 1];
  }
  __type: string;
  /**
   * Class reference to the object
   */
  @NotEnumerable
  __class: CoreModelFullDefinition<this>;
  /**
   * Dirty attributes
   */
  __dirty: Set<string>;

  constructor() {
    this.__class = <any>this.constructor;
    this.__type = this.__class.getIdentifier();
  }

  /**
   * Increment an attribute
   * @param property
   * @param value
   * @param itemWriteConditionField
   * @param itemWriteCondition
   * @returns
   */
  incrementAttribute<K extends never, L extends Attributes<this>>(
    property: K,
    value?: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: this[L]
  ) {
    return this.incrementAttributes([{ property, value }], <any>itemWriteConditionField, itemWriteCondition);
  }
  abstract delete<K extends keyof ModelAttributes<this>>(
    itemWriteConditionField?: K,
    itemWriteCondition?: this[K]
  ): Promise<void>;
  abstract incrementAttributes<K extends Attributes<this>, L extends FilterAttributes<this, number>>(
    info: ({ property: L; value: number } | L)[],
    itemWriteConditionField?: K,
    itemWriteCondition?: this[K]
  );
  abstract patch(obj: Partial<this>, conditionField?: keyof this | null, conditionValue?: any): Promise<void>;
  abstract save(full?: boolean | keyof this, ...fields: (keyof this)[]): Promise<this>;
  abstract upsertItemToCollection<K extends FilterAttributes<this, Array<any>>>(
    collection: K,
    item: any,
    index?: number,
    conditionField?: any,
    conditionValue?: any
  ): Promise<void>;
  abstract deleteItemFromCollection<K extends FilterAttributes<this, Array<any>>>(
    collection: K,
    index: number,
    conditionField?: any,
    conditionValue?: any
  ): Promise<void>;
  abstract setAttribute<K extends keyof ModelAttributes<this>, L extends keyof ModelAttributes<this>>(
    property: K,
    value: this[K],
    itemWriteConditionField?: L,
    itemWriteCondition?: this[L]
  );

  /**
   * isDirty check if the object has been modified
   */
  isDirty(): boolean {
    if (this.__dirty === undefined) {
      throw new Error("isDirty called on a non proxied object");
    }
    return this.__dirty?.size > 0;
  }

  /**
   * Define a object that can define permission on attribute level
   */
  abstract attributePermission(attribute: string | symbol, value: any, action: "READ" | "WRITE"): any;
  abstract getUuid(): string;
  abstract setUuid(uuid: string): this;
}

/**
 * Define a object that can define permission on attribute level
 */
export interface IAttributeLevelPermissionModel extends IContextAware {
  attributePermission(attribute: string | symbol, value: any, action: "READ" | "WRITE"): any;
}

export type ModelAttributes<T extends AbstractCoreModel> = Omit<T, Methods<T> | "Events">;

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
