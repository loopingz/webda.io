import { Constructor, Methods, NotEnumerable } from "@webda/tsc-esm";
import { AsyncEventEmitter, AsyncEventUnknown } from "../events/asynceventemitter";
import { Context } from "../contexts/icontext";
import { StoreHelper } from "../stores/istore";
import { JSONSchema7 } from "json-schema";
import { ModelGraph, ModelsTree } from "../application/iapplication";
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

/**
 * Define a object that act like a Webda Model
 */
export abstract class AbstractCoreModel implements IAttributeLevelPermissionModel {
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
  abstract save(): Promise<this>;
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

export interface IModelRefWithCreate<T extends AbstractCoreModel> {
  patch(updates: any): unknown;
  setAttribute(arg0: string, arg1: number): unknown;
  exists(): unknown;
  get(): Promise<T>;
  create(data: RawModel<T>): Promise<T>;
  upsert(data: RawModel<T>): Promise<T>;
  delete(): Promise<void>;
  update(data: RawModel<T>): Promise<T>;
}
/**
 *
 */
export type CoreModelDefinition<T extends AbstractCoreModel = AbstractCoreModel> = AsyncEventEmitter<T["Events"]> & {
  new (): T;
  /**
   * If the model have some Expose annotation
   */
  Expose?: ExposeParameters;
  /**
   * Create a CoreModel object loaded with the content of object
   *
   * It allows polymorphism from Store
   *
   * By default it will act as a create method without saving
   * @param model to create by default
   * @param object to load data from
   */
  factory<T>(this: Constructor<T>, object: Partial<T>): Promise<Proxied<T>>;
  /**
   * Get the model actions
   */
  getActions(): { [key: string]: ModelAction };
  /**
   * Get the model schema
   */
  getSchema(): JSONSchema7;

  /**
   * Get the model hierarchy
   */
  getHierarchy(): { ancestors: string[]; children: ModelsTree };
  /**
   * Get the model relations
   */
  getRelations(): ModelGraph;
  /**
   * Get Model identifier
   */
  getIdentifier(): string;

  /**
   * Complete uuid useful to implement uuid prefix or suffix
   * @param uid
   */
  completeUid(uid: string): string;
  /**
   * Get the model uuid field if you do not want to use the uuid field
   */
  getUuidField(): string;
  /**
   * Permission query for the model
   * @param context
   */
  getPermissionQuery(context: Context): null | { partial: boolean; query: string };
  /**
   * Reference to an object without doing a DB request yet
   */
  ref: (uuid: string) => IModelRefWithCreate<T>;
  /**
   * Get an object
   */
  get: (uuid: string) => Promise<any>;
  /**
   * Create a new model
   * @param this
   * @param data
   * @param save if the object should be saved
   */
  create<T extends object>(this: Constructor<T>, data: RawModel<T>, save?: boolean): Promise<Proxied<T>>;
  /**
   * Query the model
   * @param query
   */
  query(query?: string, includeSubclass?: boolean): Promise<{ results: T[]; continuationToken?: string }>;
  /**
   * Iterate through objects
   * @param query
   * @param includeSubclass
   * @param context
   */
  iterate(query?: string, includeSubclass?: boolean): AsyncGenerator<T>;
  /**
   * Return the event on the model that can be listened to by an
   * external authorized source
   * @see authorizeClientEvent
   */
  getClientEvents(): ({ name: string; global?: boolean } | string)[];
  /**
   * Authorize a public event subscription
   * @param event
   * @param context
   */
  authorizeClientEvent(_event: string, _context: Context, _model?: T): boolean;
  /**
   * Resolve and init the model
   */
  resolve(): void;
};

export type CoreModelFullDefinition<T extends AbstractCoreModel> = CoreModelDefinition<T> & {
  Store: StoreHelper;
  /**
   * Use Store
   * @deprecated
   */
  store(): StoreHelper;
};

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
