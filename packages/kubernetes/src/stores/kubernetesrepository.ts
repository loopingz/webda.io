import { MemoryRepository, StoreNotFoundError, UpdateConditionFailError } from "@webda/core";
import type { ModelClass } from "@webda/core";
import * as WebdaQL from "@webda/ql";
import { isResourceName } from "../crd/naming.js";
import { CustomResource, CustomResources, isApiStatus } from "./resources.js";

/** Label holding the model of a resource, its identifier with `/` replaced by `.` */
export const TYPE_LABEL = "webda.io/model";
/** Annotation holding the exact model identifier of a resource */
export const TYPE_ANNOTATION = "webda.io/model";

/** Label value: at most 63 characters, alphanumeric at both ends, `-`, `_` or `.` inside */
const LABEL_VALUE = /^(([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?$/;

/**
 * How a model is mapped to its custom resources
 */
export interface KubernetesRepositoryOptions {
  /**
   * Fields stored in `status`, written through the status subresource
   */
  statusFields?: string[];
  /**
   * Fields mirrored as labels, so queries on them are filtered by the API server
   */
  labelFields?: string[];
  /**
   * Attempts of a read-modify-write before giving up on conflicts
   * @default 5
   */
  maxRetries?: number;
}

/**
 * Label value of a field value
 * @param value - the field value
 * @returns the label value, undefined when the value cannot be a label
 */
export function toLabelValue(value: unknown): string | undefined {
  if (!["string", "number", "boolean"].includes(typeof value)) return undefined;
  const label = String(value);
  return label.length <= 63 && LABEL_VALUE.test(label) ? label : undefined;
}

/**
 * Model identifier an object declares: the `__type` it was read with, else the identifier of its class
 * @param item - the object
 * @returns the identifier, undefined for plain data
 */
function declaredType(item: any): string | undefined {
  const own = Object.getOwnPropertyDescriptor(item, "__type");
  if (own && !own.enumerable && typeof own.value === "string") return own.value;
  const clazz = Object.getPrototypeOf(item)?.constructor;
  return clazz && clazz !== Object ? clazz.Metadata?.Identifier : undefined;
}

/**
 * Memory repository storing plain JSON rows, as the custom resources hold them
 */
class PlainMemoryRepository<T extends ModelClass> extends MemoryRepository<T> {
  /**
   * The object as a plain JSON row with its `__type`
   * @override
   */
  serialize(item: InstanceType<T>): string {
    const row = JSON.parse(JSON.stringify(item));
    const type = declaredType(item);
    if (type) row.__type = type;
    return JSON.stringify(row);
  }

  /**
   * Patch without condition (checked by the Kubernetes repository), classes without `load` included
   * @override
   */
  async patch(primaryKey: any, data: any): Promise<void> {
    const item: any = this.getSync(primaryKey);
    if (typeof item.load === "function") item.load(data);
    else Object.assign(item, data);
    this.storage.set(this.getPrimaryKey(primaryKey).toString(), this.serialize(item));
  }
}

/**
 * Repository storing a model as Kubernetes custom resources
 *
 * The primary key is the name of the resource, the stored fields the `spec`, the status fields the `status`. The
 * model identifier is in the `webda.io/model` annotation (and label): subclasses share the resources of their root
 * model. Resources without it (created with kubectl) belong to the root model.
 *
 * Writes are optimistic: a read-modify-write (update, patch, increments, collections...) replaces the resource with
 * the `resourceVersion` it read and retries on conflict. Each of them runs the in-memory implementation of
 * {@link MemoryRepository} on the read object, so the semantics are the same as the memory store. Queries list the
 * resources (equality on label fields is filtered by the API server) and are evaluated in memory.
 */
export class KubernetesRepository<T extends ModelClass> extends MemoryRepository<T> {
  protected statusFields: string[];
  protected labelFields: string[];
  protected maxRetries: number;

  /**
   * @param model - the model class
   * @param pks - primary key fields
   * @param resources - the custom resources of the root model
   * @param options - fields mapping
   * @param separator - composite key separator
   */
  constructor(
    model: T,
    pks: string[],
    protected resources: CustomResources,
    options: KubernetesRepositoryOptions = {},
    separator?: string
  ) {
    super(model, pks, separator);
    this.statusFields = options.statusFields ?? [];
    this.labelFields = options.labelFields ?? [];
    this.maxRetries = options.maxRetries ?? 5;
  }

  /**
   * A repository holding objects in memory, with this repository's model and table root
   * @param storage - the serialized objects by key
   * @returns the repository
   */
  protected scratch(storage: Map<string, string> = new Map()): MemoryRepository<T> {
    return new PlainMemoryRepository<T>(this.model, this.pks, this.separator, storage).setTableRoot(
      this.getTableRoot()
    );
  }

  /**
   * Name of the resource of a key
   * @param key - the primary key as a string
   * @returns the name
   * @throws Error when the key is not a valid resource name
   */
  protected toName(key: string): string {
    if (!isResourceName(key)) {
      throw new Error(`Invalid key '${key}': a Kubernetes name is a lowercase DNS subdomain of at most 253 characters`);
    }
    return key;
  }

  /**
   * Convert an object to its custom resource
   * @param item - the model instance
   * @param current - the resource it replaces, its metadata is kept
   * @returns the resource
   * @throws Error when the key or a label field value is not valid for Kubernetes
   */
  protected toResource(item: any, current?: CustomResource): CustomResource {
    const name = this.toName(this.getPrimaryKey(item).toString());
    const spec = JSON.parse(JSON.stringify(item));
    delete spec.__type;
    const type = declaredType(item) ?? current?.metadata.annotations?.[TYPE_ANNOTATION];
    for (const field of this.pks) delete spec[field];
    const status: Record<string, any> = {};
    for (const field of this.statusFields) {
      if (spec[field] !== undefined) status[field] = spec[field];
      delete spec[field];
    }
    const labels: Record<string, string> = { ...current?.metadata.labels };
    const annotations: Record<string, string> = { ...current?.metadata.annotations };
    if (type) {
      labels[TYPE_LABEL] = type.replace(/\//g, ".");
      annotations[TYPE_ANNOTATION] = type;
    }
    for (const field of this.labelFields) {
      const value = spec[field] ?? status[field];
      if (value === undefined || value === null) {
        delete labels[field];
        continue;
      }
      const label = toLabelValue(value);
      if (label === undefined) {
        throw new Error(`Invalid value of the label field '${field}' of ${name}: a Kubernetes label value is expected`);
      }
      labels[field] = label;
    }
    return {
      apiVersion: this.resources.apiVersion,
      kind: this.resources.type.kind,
      metadata: { ...current?.metadata, name, labels, annotations },
      spec,
      ...(this.statusFields.length ? { status } : {})
    };
  }

  /**
   * Model identifier of a resource
   * @param resource - the resource
   * @returns the identifier, undefined when the resource has none
   */
  protected typeOf(resource: CustomResource): string | undefined {
    return resource.metadata.annotations?.[TYPE_ANNOTATION];
  }

  /**
   * Convert a custom resource to the model instance
   * @param resource - the resource
   * @returns the model instance
   */
  protected fromResource(resource: CustomResource): InstanceType<T> {
    const type = this.typeOf(resource);
    const row = {
      ...resource.spec,
      ...resource.status,
      ...(this.parseUID(resource.metadata.name, true) as object),
      ...(type ? { __type: type } : {})
    };
    return this.deserialize(JSON.stringify(row));
  }

  /**
   * Read the resource of a key
   * @param key - the primary key as a string
   * @returns the resource
   * @throws Error `Not found` when it does not exist
   */
  protected async read(key: string): Promise<CustomResource> {
    try {
      return await this.resources.get(this.toName(key));
    } catch (err) {
      if (isApiStatus(err, 404)) throw new Error(`Not found: ${key}`);
      throw err;
    }
  }

  /**
   * Write an object over the resource it was read from: spec, labels and annotations with the read resourceVersion,
   * then the status
   *
   * The status is written with the latest resourceVersion: a concurrent status change is overwritten.
   * @param current - the resource read
   * @param item - the new object
   * @throws ApiException 409 when the resource changed since it was read
   */
  protected async write(current: CustomResource, item: any): Promise<void> {
    const resource = this.toResource(item, current);
    const { status, ...main } = resource;
    let written = current;
    if (
      JSON.stringify([main.spec, main.metadata.labels, main.metadata.annotations]) !==
      JSON.stringify([current.spec, current.metadata.labels, current.metadata.annotations])
    ) {
      written = await this.resources.replace({ ...main, status: current.status });
    }
    if (!this.statusFields.length || JSON.stringify(status) === JSON.stringify(current.status ?? {})) return;
    for (let attempt = 1; ; attempt++) {
      try {
        await this.resources.replaceStatus({ ...written, status });
        return;
      } catch (err) {
        if (!isApiStatus(err, 409) || attempt >= this.maxRetries) throw err;
        written = await this.resources.get(current.metadata.name);
      }
    }
  }

  /**
   * Name of the stored objects, used in errors
   * @returns the model identifier, else the resources plural
   */
  protected getCollectionName(): string {
    return (this.model as any).Metadata?.Identifier ?? this.resources.type.plural;
  }

  /**
   * Whether a field of an object has the expected value (dates compare with their ISO string)
   * @param item - the object
   * @param field - the field, dotted for a nested one
   * @param condition - the expected value
   * @returns true when it has
   */
  protected conditionHolds(item: any, field: string, condition: any): boolean {
    const value = WebdaQL.ComparisonExpression.getAttributeValue(item, String(field).split("."));
    return JSON.stringify(value) === JSON.stringify(condition);
  }

  /**
   * Read, check, change and write an object, again on conflict
   *
   * The change runs on an in-memory repository holding the object read, so the memory store semantics apply.
   * @param primaryKey - the key
   * @param change - the change, on the in-memory repository
   * @param options - conditions and errors
   * @param options.conditionField - field of the condition on the object
   * @param options.condition - expected value of the field
   * @param options.itemConditionField - field of the condition on a collection item, for its error
   * @param options.itemCondition - expected value of the item field, for its error
   * @param options.missing - error of a missing object: `condition` for an UpdateConditionFailError, `store` for a
   * StoreNotFoundError
   * @returns the result of the change
   * @throws UpdateConditionFailError when a condition fails
   */
  protected async mutate<R>(
    primaryKey: any,
    change: (memory: MemoryRepository<T>, key: string) => Promise<R>,
    options: {
      conditionField?: any;
      condition?: any;
      itemConditionField?: any;
      itemCondition?: any;
      missing: "condition" | "store";
    }
  ): Promise<R> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const { conditionField, condition, itemConditionField, itemCondition, missing } = options;
    for (let attempt = 1; ; attempt++) {
      let current: CustomResource;
      try {
        current = await this.read(key);
      } catch (err) {
        if (!(err instanceof Error && err.message.startsWith("Not found"))) throw err;
        if (missing === "store") throw new StoreNotFoundError(key, this.getCollectionName());
        throw new UpdateConditionFailError(key, conditionField ?? itemConditionField, condition ?? itemCondition);
      }
      const item = this.fromResource(current);
      if (conditionField && !this.conditionHolds(item, conditionField, condition)) {
        throw new UpdateConditionFailError(key, conditionField, condition);
      }
      const storage = new Map<string, string>();
      const memory = this.scratch(storage);
      storage.set(key, memory.serialize(item));
      let result: R;
      try {
        result = await change(memory, key);
      } catch (err) {
        if (err instanceof Error && err.message === "Item write condition failed") {
          throw new UpdateConditionFailError(key, itemConditionField, itemCondition);
        }
        throw err;
      }
      try {
        await this.write(current, memory.deserialize(storage.get(key)!));
        return result;
      } catch (err) {
        if (!isApiStatus(err, 409) || attempt >= this.maxRetries) throw err;
      }
    }
  }

  /** @override */
  async get(primaryKey: any): Promise<any> {
    return this.fromResource(await this.read(this.getPrimaryKey(primaryKey).toString()));
  }

  /** @override */
  async exists(primaryKey: any): Promise<boolean> {
    try {
      await this.read(this.getPrimaryKey(primaryKey).toString());
      return true;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Not found")) return false;
      throw err;
    }
  }

  /** @override */
  async create(data: any, save: boolean = true): Promise<any> {
    const item = this.buildItem(data);
    const key = this.getPrimaryKey(item).toString();
    const { status, ...resource } = this.toResource(item);
    if (save === false) return item;
    let created: CustomResource;
    try {
      created = await this.resources.create(resource);
    } catch (err) {
      if (isApiStatus(err, 409)) throw new Error(`Already exists: ${key}`);
      throw err;
    }
    if (status && Object.keys(status).length) {
      await this.resources.replaceStatus({ ...created, status });
    }
    return item;
  }

  /** @override */
  async update(data: any, conditionField?: any, condition?: any): Promise<void> {
    await this.mutate(data, memory => memory.update(data as any), { conditionField, condition, missing: "condition" });
  }

  /** @override */
  async patch(primaryKey: any, data: any, conditionField?: any, condition?: any): Promise<void> {
    await this.mutate(primaryKey, (memory, key) => memory.patch(key as any, data), {
      conditionField,
      condition,
      missing: "condition"
    });
  }

  /** @override */
  async incrementAttributes(primaryKey: any, info: any, conditionField?: any, condition?: any): Promise<any> {
    return this.mutate(primaryKey, (memory, key) => memory.incrementAttributes(key as any, info), {
      conditionField,
      condition,
      missing: conditionField ? "condition" : "store"
    });
  }

  /** @override */
  async removeAttribute(primaryKey: any, attribute: any, conditionField?: any, condition?: any): Promise<void> {
    await this.mutate(primaryKey, (memory, key) => memory.removeAttribute(key as any, attribute), {
      conditionField,
      condition,
      missing: conditionField ? "condition" : "store"
    });
  }

  /** @override */
  async upsertItemToCollection(
    primaryKey: any,
    collection: any,
    item: any,
    index?: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    await this.mutate(
      primaryKey,
      (memory, key) =>
        memory.upsertItemToCollection(key as any, collection, item, index, itemWriteConditionField, itemWriteCondition),
      {
        itemConditionField: itemWriteConditionField,
        itemCondition: itemWriteCondition,
        missing: itemWriteCondition !== undefined ? "condition" : "store"
      }
    );
  }

  /** @override */
  async deleteItemFromCollection(
    primaryKey: any,
    collection: any,
    index: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    await this.mutate(
      primaryKey,
      (memory, key) =>
        memory.deleteItemFromCollection(key as any, collection, index, itemWriteConditionField, itemWriteCondition),
      {
        itemConditionField: itemWriteConditionField,
        itemCondition: itemWriteCondition,
        missing: itemWriteCondition !== undefined ? "condition" : "store"
      }
    );
  }

  /** @override */
  async delete(primaryKey: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const name = this.toName(key);
    for (let attempt = 1; ; attempt++) {
      let resourceVersion: string | undefined;
      if (conditionField) {
        let current: CustomResource;
        try {
          current = await this.read(key);
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("Not found")) {
            throw new UpdateConditionFailError(key, conditionField, condition);
          }
          throw err;
        }
        if (!this.conditionHolds(this.fromResource(current), conditionField, condition)) {
          throw new UpdateConditionFailError(key, conditionField, condition);
        }
        resourceVersion = current.metadata.resourceVersion;
      }
      try {
        await this.resources.delete(name, resourceVersion);
        return;
      } catch (err) {
        if (isApiStatus(err, 404)) {
          if (conditionField) throw new UpdateConditionFailError(key, conditionField, condition);
          return;
        }
        if (!isApiStatus(err, 409) || attempt >= this.maxRetries) throw err;
      }
    }
  }

  /**
   * Label selector equivalent to the conditions of a filter on label fields: `=` and `IN` at the top level
   *
   * It only narrows the listed resources, the whole filter is still evaluated.
   * @param filter - the query filter
   * @returns the selector, undefined when nothing can be filtered by the API server
   */
  protected labelSelector(filter: WebdaQL.Expression): string | undefined {
    const conditions = filter instanceof WebdaQL.AndExpression ? filter.children : [filter];
    const requirements: string[] = [];
    for (const condition of conditions) {
      if (!(condition instanceof WebdaQL.ComparisonExpression) || condition.attribute.length !== 1) continue;
      const field = condition.attribute[0];
      if (!this.labelFields.includes(field)) continue;
      if (condition.operator === "=") {
        const label = toLabelValue(condition.value);
        if (label !== undefined) requirements.push(`${field}=${label}`);
      } else if (condition.operator === "IN" && Array.isArray(condition.value)) {
        const labels = condition.value.map(toLabelValue);
        if (labels.every(l => l !== undefined)) requirements.push(`${field} in (${labels.join(",")})`);
      }
    }
    return requirements.length ? requirements.join(",") : undefined;
  }

  /** @override */
  async query(query: any, params?: WebdaQL.QueryParameters): Promise<{ results: any[]; continuationToken?: string }> {
    const parsed =
      typeof query === "string"
        ? WebdaQL.parse(params !== undefined ? WebdaQL.bind(query, params) : query)
        : WebdaQL.normalizeQuery(query);
    WebdaQL.assertFilterQuery(parsed);
    const storage = new Map<string, string>();
    const memory = this.scratch(storage);
    for (const resource of await this.resources.listAll(this.labelSelector(parsed.filter))) {
      // Resources of another branch of the root model's hierarchy
      if (!this.belongsToModel(this.typeOf(resource))) continue;
      const item = this.fromResource(resource);
      storage.set(this.getPrimaryKey(item).toString(), memory.serialize(item));
    }
    return memory.query(query, params);
  }

  /**
   * Delete the matching objects one by one: no native bulk delete
   * @override
   */
  async deleteMany(statement: any, params?: WebdaQL.QueryParameters): Promise<number> {
    return this.deleteManyByKey(statement, params);
  }

  /**
   * Update the matching objects one by one: no native bulk update
   * @override
   */
  async updateMany(statement: any, params?: WebdaQL.QueryParameters): Promise<number> {
    return this.updateManyByKey(statement, params);
  }
}
