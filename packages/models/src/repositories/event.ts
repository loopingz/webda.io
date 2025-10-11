import { PK, PrimaryKeyType, StorableAttributes, ModelClass, WEBDA_PRIMARY_KEY } from "../storable";
import type { SelfJSONed, JSONed, Helpers } from "../types";
import { AbstractRepository } from "./abstract";
import { ArrayElement, ReadonlyKeys } from "@webda/tsc-esm";
import { WEBDA_TEST } from "./repository";

/**
 * Add event emitter to repository
 */
export class EventRepository<T extends ModelClass = any> extends AbstractRepository<T> {
  constructor(
    model: T,
    pks: string[],
    protected repository: AbstractRepository<T>
  ) {
    super(model, pks, "_");
  }

  async incrementAttributes<
    K extends StorableAttributes<InstanceType<T>, any>,
    L extends StorableAttributes<InstanceType<T>, number>
  >(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    info: (L | { property: L; value?: number })[] | Record<L, number>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    await this.emit("PartialUpdate", {
      object_id: primaryKey,
      partial_update: {
        increments: info
      }
    } as any);
    await this.repository.incrementAttributes(primaryKey, info, _conditionField, _condition);
    await this.emit("PartialUpdated", {
      object_id: primaryKey,
      partial_update: {
        increments: info
      }
    } as any);
  }

  /**
   *
   * @param query The query to execute
   * @returns
   */
  async query(query: string): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    await this.emit("Query", { query } as any);
    const res = await this.repository.query(query);
    await this.emit("Queried", { ...res, query } as any);
    return res;
  }

  /**
   * Iterate through all objects
   * @param query
   * @returns
   */
  iterate(query: string): AsyncGenerator<InstanceType<T>, any, any> {
    return this.repository.iterate(query);
  }

  /**
   * Delete an item from a collection
   * @param uuid The UUID of the item
   * @param collection The collection to delete from
   * @param index The index of the item to delete
   * @param itemWriteConditionField The field to use for the write condition
   * @param itemWriteCondition The value to use for the write condition
   */
  async deleteItemFromCollection<
    K extends StorableAttributes<InstanceType<T>, any[]>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    uuid: PrimaryKeyType<InstanceType<T>>,
    collection: K,
    index: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]>[L]
  ): Promise<void> {
    await this.emit("PartialUpdate", {
      object_id: uuid,
      partial_update: {
        delete_from_collection: {
          collection,
          index,
          itemWriteConditionField,
          itemWriteCondition
        }
      }
    } as any);
    await this.repository.deleteItemFromCollection(
      uuid,
      collection,
      index,
      itemWriteConditionField,
      itemWriteCondition
    );
    await this.emit("PartialUpdated", {
      object_id: uuid,
      partial_update: {
        delete_from_collection: {
          collection,
          index,
          itemWriteConditionField,
          itemWriteCondition
        }
      }
    } as any);
  }

  async upsertItemToCollection<
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
    await this.emit("PartialUpdate", {
      object_id: uuid,
      partial_update: {
        upsert_in_collection: {
          collection,
          item,
          index,
          itemWriteConditionField,
          itemWriteCondition
        }
      }
    } as any);
    await this.repository.upsertItemToCollection(
      uuid,
      collection,
      item,
      index,
      itemWriteConditionField,
      itemWriteCondition
    );
    await this.emit("PartialUpdated", {
      object_id: uuid,
      partial_update: {
        upsert_in_collection: {
          collection,
          item,
          index,
          itemWriteConditionField,
          itemWriteCondition
        }
      }
    } as any);
  }
  async removeAttribute<
    L extends StorableAttributes<InstanceType<T>>,
    K extends Exclude<
      StorableAttributes<InstanceType<T>, any>,
      "toString" | ReadonlyKeys<InstanceType<T>> | InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]
    >
  >(
    uuid: PrimaryKeyType<InstanceType<T>>,
    attribute: K,
    conditionField?: L | null,
    condition?: InstanceType<T>[L] | JSONed<InstanceType<T>[L]>
  ): Promise<void> {
    await this.emit("PartialUpdate", {
      object_id: uuid,
      partial_update: {
        remove_attribute: {
          attribute,
          conditionField,
          condition
        }
      }
    } as any);
    await this.repository.removeAttribute(uuid, attribute, conditionField, condition);
    await this.emit("PartialUpdated", {
      object_id: uuid,
      partial_update: {
        remove_attribute: {
          attribute,
          conditionField,
          condition
        }
      }
    } as any);
  }
  async get(primaryKey: PrimaryKeyType<InstanceType<T>>): Promise<Helpers<InstanceType<T>>> {
    const res = await this.repository.get(primaryKey);
    return res;
  }
  async create(data: Helpers<InstanceType<T>>, save?: boolean): Promise<InstanceType<T>> {
    await this.emit("Create", { object_id: this.getPrimaryKey(data), object: data } as any);
    const res = await this.repository.create(data, save);
    await this.emit("Created", { object_id: this.getPrimaryKey(data), object: data } as any);
    return res;
  }
  async patch<K extends StorableAttributes<InstanceType<T>, any>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    data: Partial<InstanceType<T>>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    await this.emit("Patch", { object_id: primaryKey, object: data } as any);
    await this.repository.patch(primaryKey, data, _conditionField, _condition);
    await this.emit("Patched", { object_id: primaryKey, object: data } as any);
  }
  async update<K extends StorableAttributes<InstanceType<T>>>(
    data: Helpers<InstanceType<T>>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K]
  ): Promise<void> {
    await this.emit("Update", { object_id: this.getPrimaryKey(data), object: data } as any);
    await this.repository.update(data, conditionField, condition);
    await this.emit("Updated", { object_id: this.getPrimaryKey(data), object: data } as any);
  }
  async delete<K extends StorableAttributes<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K] | JSONed<InstanceType<T>[K]>
  ): Promise<void> {
    await this.emit("Delete", { object_id: uuid } as any);
    await this.repository.delete(uuid, conditionField, condition);
    await this.emit("Deleted", { object_id: uuid } as any);
  }
  async exists(uuid: PrimaryKeyType<InstanceType<T>>): Promise<boolean> {
    const res = await this.repository.exists(uuid);
    return res;
  }

  [WEBDA_TEST]: {
    clear: (excludeListeners?: boolean) => Promise<void>;
  } = {
    clear: async excludeListeners => {
      if (!excludeListeners) {
        this.events.clear();
      }
      // @ts-ignore
      this.repository[WEBDA_TEST].clear();
    }
  };
}
