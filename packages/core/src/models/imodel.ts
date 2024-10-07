import { Attributes, Constructor, FilterAttributes, Methods, NotEnumerable } from "@webda/tsc-esm";
import { AsyncEventEmitter, AsyncEventUnknown } from "../events/asynceventemitter";
import { Context } from "../contexts/icontext";
import { CRUDHelper, CRUDModel, StoreHelper } from "../stores/istore";
import { JSONSchema7 } from "json-schema";
import { ModelGraph, ModelsTree, IModel } from "../application/iapplication";
import { ModelAction, RawModel } from "./types";
import { IContextAware, canUpdateContext } from "../contexts/icontext";
import { useContext } from "../contexts/execution";

/**
 * Proxied object
 *
 * TODO: Check if this is real useful
 */
export type Proxied<T> = T;

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

/**
 * Expose parameters for the model
 */
export interface ExposeParameters {
  /**
   * If model have parent but you still want it to be exposed as root
   * in domain-like service: DomainService, GraphQL
   *
   * It would create alias for the model in the root too
   */
  root?: boolean;
  /**
   * You can select to not expose some methods like create, update, delete, get, query
   */
  restrict: {
    /**
     * Create a new object
     */
    create?: boolean;
    /**
     * Update an existing object
     *
     * Includes PUT and PATCH
     */
    update?: boolean;
    /**
     * Query the object
     */
    query?: boolean;
    /**
     * Get a single object
     */
    get?: boolean;
    /**
     * Delete an object
     */
    delete?: boolean;
    /**
     * Do not create operations for the model
     */
    operation?: boolean;
  };
}

/**
 * ModelRef create
 */
export interface IModelRefWithCreate<T extends AbstractCoreModel> extends CRUDHelper<T> {
  get(): Promise<T>;
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
