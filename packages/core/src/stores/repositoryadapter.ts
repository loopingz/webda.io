import {
  AbstractRepository,
  JSONed,
  ModelClass,
  PK,
  PrimaryKeyType,
  SelfJSONed,
  StorableAttributes,
  WEBDA_EVENTS,
  WEBDA_PRIMARY_KEY
} from "@webda/models";
import { Store } from "./store";
import { ReadonlyKeys, ArrayElement } from "@webda/tsc-esm";
import { useModelMetadata } from "../core/hooks";

export class RepositoryStoreAdapter<T extends ModelClass> extends AbstractRepository<T> {
  constructor(
    protected store: Store,
    model: T
  ) {
    super(model, useModelMetadata(model).PrimaryKey, useModelMetadata(model).PrimaryKeySeparator);
  }

  incrementAttributes<
    K extends StorableAttributes<InstanceType<T>, any>,
    L extends StorableAttributes<InstanceType<T>, number>
  >(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    info: (L | { property: L; value?: number })[] | Record<L, number>,
    _conditionField?: K,
    _condition?: any
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  query(query: string): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    return this.store.query(query);
  }
  async *iterate(query: string): AsyncGenerator<InstanceType<T>, any, any> {
    return this.store.iterate(query);
  }
  deleteItemFromCollection<
    K extends StorableAttributes<InstanceType<T>, any[]>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    uuid: PrimaryKeyType<InstanceType<T>>,
    collection: K,
    index: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]>[L]
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  upsertItemToCollection<
    K extends StorableAttributes<InstanceType<T>, any[]>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    uuid: PrimaryKeyType<InstanceType<T>>,
    collection: K,
    item: ArrayElement<InstanceType<T>[K]> | JSONed<ArrayElement<InstanceType<T>[K]>>,
    index?: number,
    itemWriteConditionField?: ArrayElement<InstanceType<T>[K]> extends object ? L : never,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]> extends object
      ? (object & ArrayElement<InstanceType<T>[K]>)[L]
      : ArrayElement<InstanceType<T>[K]>
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  removeAttribute<
    L extends StorableAttributes<InstanceType<T>>,
    K extends Exclude<
      StorableAttributes<InstanceType<T>, any>,
      "toString" | ReadonlyKeys<InstanceType<T>> | InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]
    >
  >(
    uuid: PrimaryKeyType<InstanceType<T>>,
    attribute: K,
    conditionField?: L,
    condition?: InstanceType<T>[L] | JSONed<InstanceType<T>[L]>
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  get(primaryKey: PrimaryKeyType<InstanceType<T>>): Promise<InstanceType<T>> {
    throw new Error("Method not implemented.");
  }
  create(data: ConstructorParameters<T>[0], save?: boolean): Promise<InstanceType<T>> {
    throw new Error("Method not implemented.");
  }
  patch<K extends StorableAttributes<InstanceType<T>, any>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    data: Partial<SelfJSONed<InstanceType<T>>>,
    _conditionField?: K,
    _condition?: any
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  update<K extends StorableAttributes<InstanceType<T>>>(
    data: InstanceType<T> | SelfJSONed<InstanceType<T>>,
    conditionField?: K,
    condition?: InstanceType<T>[K]
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  delete<K extends StorableAttributes<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    conditionField?: K,
    condition?: InstanceType<T>[K] | JSONed<InstanceType<T>[K]>
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  exists(uuid: PrimaryKeyType<InstanceType<T>>): Promise<boolean> {
    throw new Error("Method not implemented.");
  }
  on<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void
  ): void {
    throw new Error("Method not implemented.");
  }
  once<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void
  ): void {
    throw new Error("Method not implemented.");
  }
  off<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void
  ): void {
    throw new Error("Method not implemented.");
  }
}
