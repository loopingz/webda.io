import { DocumentReference, FieldValue, Firestore, OrderByDirection, Timestamp } from "@google-cloud/firestore";
import {
  EventRepository,
  InstanceCache,
  MemoryRepository,
  Store,
  StoreNotFoundError,
  StoreParameters,
  UpdateConditionFailError,
  useModel,
  useModelMetadata
} from "@webda/core";
import type { ModelClass, Repository } from "@webda/core";
import * as WebdaQL from "@webda/ql";

/**
 * Definition of a FireStore index
 */
export type FireStoreIndex = { [key: string]: "asc" | "desc" };
/**
 * Stored version of indexes
 */
export type FireStoreIndexOrder = { [key: string]: Set<"asc" | "desc"> };

/**
 * Result of a Firestore find, `filter` is the part of the query that Firestore
 * could not apply natively and that was applied in memory (`true` if none)
 */
export interface FireStoreFindResult<T> {
  results: T[];
  filter: WebdaQL.Expression | true;
  continuationToken?: string;
}

/**
 * Firestore error code for a missing document
 */
const NOT_FOUND = 5;
/**
 * Firestore error code for an already existing document
 */
const ALREADY_EXISTS = 6;

/**
 * Firebase parameters
 */
export class FireStoreParameters extends StoreParameters {
  /**
   * Collection to use
   */
  collection: string;
  /**
   * Per-model collection overrides.
   * Maps a model identifier (e.g. "Webda/User") to a collection name.
   * When not specified, the first model uses `collection` and others use their identifier
   * lowercased with "/" replaced by "_".
   */
  collections?: { [modelIdentifier: string]: string };
  /**
   * To allow efficient query on several fields
   *
   * @see https://firebase.google.com/docs/firestore/query-data/queries
   */
  compoundIndexes?: FireStoreIndex[];

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.compoundIndexes ??= [];
    this.collections ??= {};
    return this;
  }
}

/**
 * Recursively convert a value to what Firestore can store
 *
 * Dates are kept as is (Firestore stores them as Timestamp), objects exposing a
 * `toJSON` (models, binaries) are serialized first, functions and undefined are dropped
 *
 * @param value - the value to convert
 * @returns the Firestore compatible value
 */
export function toFirestore(value: any): any {
  if (value === undefined || value === null || value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(v => toFirestore(v));
  }
  if (typeof value === "object") {
    if (typeof value.toJSON === "function") {
      const json = value.toJSON();
      if (json !== value) {
        return toFirestore(json);
      }
    }
    const res = {};
    for (const key of Object.keys(value)) {
      if (value[key] === undefined || typeof value[key] === "function") {
        continue;
      }
      res[key] = toFirestore(value[key]);
    }
    return res;
  }
  return value;
}

/**
 * Recursively replace Timestamp by Date
 * @param doc - the Firestore document data
 * @returns the data with Date objects
 */
export function giveDatesBack(doc: any): any {
  if (doc instanceof Timestamp) {
    return doc.toDate();
  } else if (Array.isArray(doc)) {
    return doc.map(d => giveDatesBack(d));
  } else if (doc instanceof Object) {
    const res = {};
    Object.keys(doc).forEach(k => {
      res[k] = giveDatesBack(doc[k]);
    });
    return res;
  }
  return doc;
}

/**
 * Firestore-backed repository for a single model class
 *
 * Every object is stored as a document of the collection, keyed by its primary key.
 * The inherited MemoryRepository is only used for its helpers, every storage
 * method hits Firestore.
 */
export class FireStoreRepository<T extends ModelClass> extends MemoryRepository<T> {
  /**
   * Compound indexes available, keyed by the sorted fields joined with "/"
   */
  protected compoundIndexes: { [key: string]: FireStoreIndexOrder } = {};

  /**
   * @param model - the model class
   * @param pks - primary key field names
   * @param firestore - the Firestore client
   * @param collection - the collection name
   * @param indexes - compound indexes declared on the store
   * @param log - logger of the store
   */
  constructor(
    model: T,
    pks: string[],
    protected readonly firestore: Firestore,
    protected readonly collection: string,
    indexes: FireStoreIndex[] = [],
    protected readonly log: (level: any, ...args: any[]) => void = () => {},
    separator?: string
  ) {
    // Pass an empty Map — we do NOT use in-memory storage
    super(model, pks, separator, new Map<string, string>() as any);
    indexes.forEach(a => {
      const key = Object.keys(a).sort().join("/");
      // Should contain the array of accessible order
      this.compoundIndexes[key] = {};
      Object.keys(a).forEach(field => {
        this.compoundIndexes[key][field] ??= new Set<"asc" | "desc">();
        this.compoundIndexes[key][field].add(a[field]);
      });
    });
  }

  /**
   * The backing collection name for this repository's model
   * @returns the collection name
   */
  getCollection(): string {
    return this.collection;
  }

  /**
   * Get Document Reference
   * @param primaryKey - the object or primary key
   * @returns the document reference
   */
  getDocumentRef(primaryKey: any): DocumentReference {
    return this.firestore.doc(`${this.collection}/${this.getPrimaryKey(primaryKey).toString()}`);
  }

  /**
   * Deserialize a Firestore document into a model instance
   * @param data - the document data
   * @returns the model instance
   */
  protected fromFirestore(data: any): InstanceType<T> {
    data = giveDatesBack(data);
    const instance = new this.model({}) as InstanceType<T>;
    if (typeof (instance as any).load === "function") {
      (instance as any).load(data);
    } else {
      Object.assign(instance as any, data);
    }
    return instance;
  }

  /**
   * Verify a write condition
   * @param uid - the object key, for the error
   * @param data - the current data
   * @param field - the field to check
   * @param condition - the expected value
   */
  protected checkFirestoreCondition(uid: string, data: any, field: string, condition: any): void {
    if (!field) {
      return;
    }
    const current = data?.[field] instanceof Timestamp ? data[field].toDate().toISOString() : data?.[field];
    if (condition instanceof Date) {
      condition = condition.toISOString();
    }
    if (current !== condition) {
      throw new UpdateConditionFailError(uid as any, field, condition);
    }
  }

  /**
   * Translate Firestore not found error
   * @param uid - the object key
   * @param err - the error raised
   */
  protected translateError(uid: string, err: any): never {
    if (err?.code === NOT_FOUND) {
      throw new StoreNotFoundError(uid as any, this.collection);
    }
    throw err;
  }

  /** @override */
  async get(primaryKey: any): Promise<any> {
    const ref = this.getDocumentRef(primaryKey);
    const doc = (await ref.get()).data();
    if (!doc) {
      throw new StoreNotFoundError(ref.id as any, this.collection);
    }
    return this.fromFirestore(doc);
  }

  /** @override */
  async exists(primaryKey: any): Promise<boolean> {
    return (await this.getDocumentRef(primaryKey).get()).exists;
  }

  /** @override */
  async create(data: any, save: boolean = true): Promise<any> {
    // Build the item first: a primary key generated by the model is the document key
    const item = this.buildItem(data);
    if (save !== false) {
      try {
        await this.getDocumentRef(item).create(toFirestore(item));
      } catch (err) {
        if (err?.code === ALREADY_EXISTS) {
          throw new Error(`Already exists: ${this.getPrimaryKey(item).toString()}`);
        }
        throw err;
      }
    }
    return item;
  }

  /**
   * Implement both update and patch
   * @param merge - merge with the existing document (patch) or replace it (update)
   * @param primaryKey - the object or primary key
   * @param data - the data to write
   * @param conditionField - the field to check
   * @param condition - the expected value
   */
  protected async setDocument(
    merge: boolean,
    primaryKey: any,
    data: any,
    conditionField?: string,
    condition?: any
  ): Promise<void> {
    const update = toFirestore(data);
    const docRef = this.getDocumentRef(primaryKey);
    await this.firestore.runTransaction(async t => {
      const doc = await t.get(docRef);
      if (!doc.exists) {
        throw new StoreNotFoundError(docRef.id as any, this.collection);
      }
      this.checkFirestoreCondition(docRef.id, doc.data(), conditionField, condition);
      t.set(docRef, update, { merge });
    });
  }

  /** @override */
  async update(data: any, conditionField?: any, condition?: any): Promise<void> {
    await this.setDocument(false, data, data, conditionField, condition);
  }

  /** @override */
  async patch(primaryKey: any, data: any, conditionField?: any, condition?: any): Promise<void> {
    await this.setDocument(true, primaryKey, data, conditionField, condition);
  }

  /** @override */
  async delete(primaryKey: any, conditionField?: any, condition?: any): Promise<void> {
    const docRef = this.getDocumentRef(primaryKey);
    await this.firestore.runTransaction(async t => {
      const doc = await t.get(docRef);
      if (conditionField) {
        this.checkFirestoreCondition(docRef.id, doc.data(), conditionField, condition);
      }
      t.delete(docRef);
    });
  }

  /** @override */
  async removeAttribute(primaryKey: any, attribute: any, conditionField?: any, condition?: any): Promise<void> {
    const docRef = this.getDocumentRef(primaryKey);
    await this.firestore.runTransaction(async t => {
      const doc = await t.get(docRef);
      if (!doc.exists) {
        throw new StoreNotFoundError(docRef.id as any, this.collection);
      }
      this.checkFirestoreCondition(docRef.id, doc.data(), conditionField, condition);
      t.update(docRef, {
        [attribute]: FieldValue.delete()
      });
    });
  }

  /** @override */
  async incrementAttributes(primaryKey: any, info: any, _conditionField?: any, _condition?: any): Promise<void> {
    const docRef = this.getDocumentRef(primaryKey);
    const entries: Array<{ property: string; value: number }> = Array.isArray(info)
      ? info.map((e: any) =>
          typeof e === "string" ? { property: e, value: 1 } : { property: e.property, value: e.value ?? 1 }
        )
      : Object.entries(info).map(([property, value]) => ({ property, value: value as number }));
    const args: any = {
      _lastUpdate: new Date()
    };
    entries.forEach(p => {
      args[p.property] = FieldValue.increment(p.value);
    });
    try {
      await docRef.update(args);
    } catch (err) {
      this.translateError(docRef.id, err);
    }
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
    const docRef = this.getDocumentRef(primaryKey);
    const prop = String(collection);
    if (index !== undefined) {
      await this.firestore.runTransaction(async t => {
        const doc = await t.get(docRef);
        if (!doc.exists) {
          throw new StoreNotFoundError(docRef.id as any, this.collection);
        }
        const data = doc.data();
        data[prop] ??= [];
        if (itemWriteCondition !== undefined) {
          this.checkFirestoreCondition(docRef.id, data[prop][index], itemWriteConditionField, itemWriteCondition);
        }
        data[prop][index] = toFirestore(item);
        t.update(docRef, {
          [prop]: data[prop],
          _lastUpdate: new Date()
        });
      });
    } else {
      try {
        await docRef.update({
          [prop]: FieldValue.arrayUnion(toFirestore(item)),
          _lastUpdate: new Date()
        });
      } catch (err) {
        this.translateError(docRef.id, err);
      }
    }
  }

  /** @override */
  async deleteItemFromCollection(
    primaryKey: any,
    collection: any,
    index: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const docRef = this.getDocumentRef(primaryKey);
    const prop = String(collection);
    await this.firestore.runTransaction(async t => {
      const doc = await t.get(docRef);
      if (!doc.exists) {
        throw new StoreNotFoundError(docRef.id as any, this.collection);
      }
      const data = doc.data();
      const items: any[] = Array.isArray(data[prop]) ? data[prop] : [];
      if (index < 0 || index >= items.length) {
        return;
      }
      if (itemWriteCondition !== undefined) {
        this.checkFirestoreCondition(docRef.id, items[index], itemWriteConditionField, itemWriteCondition);
      }
      items.splice(index, 1);
      t.update(docRef, {
        [prop]: items,
        _lastUpdate: new Date()
      });
    });
  }

  /**
   * Run a parsed query against Firestore
   *
   * Firestore has strong limitations on what can be queried natively, the part of the
   * query that cannot be translated is applied in memory and returned as `filter`
   *
   * @param parsedQuery - the parsed WebdaQL query
   * @returns the results, the in-memory filter and the continuation token
   */
  async find(parsedQuery: WebdaQL.Query): Promise<FireStoreFindResult<InstanceType<T>>> {
    const offset: number = parseInt(parsedQuery.continuationToken || "0");
    const limit = parsedQuery.limit || 1000;
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.firestore.collection(this.collection);
    if (offset) {
      query = query.offset(offset);
    }

    const filter = new WebdaQL.AndExpression([]);
    let rangeAttribute: string;
    let toProcess: WebdaQL.AndExpression;
    if (!(parsedQuery.filter instanceof WebdaQL.AndExpression)) {
      toProcess = new WebdaQL.AndExpression([parsedQuery.filter]);
    } else {
      toProcess = parsedQuery.filter;
    }
    // A FALSE conjunct matches nothing: do not hit Firestore (never fail open)
    if (toProcess.children.some(c => c instanceof WebdaQL.BooleanExpression && !c.value)) {
      return { results: [], filter: true, continuationToken: undefined };
    }
    // A TRUE conjunct is neutral
    toProcess = new WebdaQL.AndExpression(toProcess.children.filter(c => !(c instanceof WebdaQL.BooleanExpression)));
    const queryAttributes = new Set<string>();
    let hasIn = false;
    let hasContains = false;
    toProcess.children.forEach((child: WebdaQL.Expression) => {
      if (!(child instanceof WebdaQL.ComparisonExpression)) {
        // Do not manage OR yet
        filter.children.push(child);
        return;
      }
      if (child.operator === "LIKE") {
        this.log("WARN", "Firebase do not natively have 'LIKE'");
        // LIKE is not managed by Firestore
        filter.children.push(child);
        return;
      }
      if (child.operator === "IS NULL") {
        // Firestore `== null` does not match documents missing the field
        filter.children.push(child);
        return;
      }
      let operator: FirebaseFirestore.WhereFilterOp;
      const attribute = child.attribute.join(".");
      queryAttributes.add(attribute);
      // Translate operators
      if (["=", "IN", "CONTAINS"].includes(child.operator)) {
        // = is permitted on every fields
        if (child.operator === "=") {
          operator = "==";
        } else if (child.operator === "IN") {
          operator = "in";
          if ((<any[]>child.value).length > 10) {
            this.log("WARN", "Firebase cannot have more than 10 values for 'in'");
            filter.children.push(child);
            return;
          }
          if (hasIn) {
            this.log("WARN", "Firebase cannot have two 'in' (IN) clause");
            filter.children.push(child);
            return;
          }
          hasIn = true;
        } else {
          operator = "array-contains";
          if (hasContains) {
            this.log("WARN", "Firebase cannot have two 'array-contains' (CONTAINS) clause");
            filter.children.push(child);
            return;
          }
          hasContains = true;
        }
      } else {
        // Requires compoundIndex
        if (queryAttributes.size > 1 && !this.compoundIndexes[[...queryAttributes.values()].sort().join("/")]) {
          this.log("WARN", "Compound index not defined");
          filter.children.push(child);
          return;
        }
        // Firestore `!= null` matches documents where the field exists and is not null
        const isNotNull = child.operator === "IS NOT NULL";
        if (child.operator !== "!=" && !isNotNull) {
          rangeAttribute ??= attribute;
          // Range need to apply on only one attribute
          if (rangeAttribute !== attribute) {
            filter.children.push(child);
            return;
          }
        }
        operator = isNotNull ? "!=" : <FirebaseFirestore.WhereFilterOp>child.operator;
      }
      query = query.where(attribute, operator, child.operator === "IS NOT NULL" ? null : child.value);
    });

    // OrderBy have quite some complexity with FireStore
    query = this.handleOrderBy(query, parsedQuery.orderBy, rangeAttribute);

    const res = await query.limit(limit).get();
    let results = res.docs.map(d => this.fromFirestore(d.data()));
    if (filter.children.length) {
      results = results.filter(r => filter.eval(r));
    }
    return {
      results,
      filter: filter.children.length ? filter : true,
      continuationToken: res.docs.length >= limit ? (offset + limit).toString() : undefined
    };
  }

  /**
   * Manage OrderBy complex condition on Firebase
   * @param query - the Firestore query
   * @param orderBy - the requested order
   * @param rangeAttribute - the attribute used in a range condition if any
   * @returns the Firestore query with ordering
   */
  handleOrderBy(
    query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>,
    orderBy: WebdaQL.OrderBy[],
    rangeAttribute: string
  ): FirebaseFirestore.Query<FirebaseFirestore.DocumentData> {
    // Manage order if index
    if (!orderBy) {
      return query;
    }
    const requiredIndex = orderBy.map(order => order.field).sort();
    let orders;
    // Require index with multiple ORDER BY
    if (requiredIndex.length > 1) {
      orders = this.compoundIndexes[requiredIndex.join("/")];
      if (!orders) {
        this.log("WARN", "Skip orderBy as we are missing the index");
        return query;
      }
    }
    // Range must be the first orderBy
    if (rangeAttribute) {
      if (
        !orderBy.some(order => {
          // Need to check the permitted orderBy and direction
          if (order.field === rangeAttribute) {
            query = query.orderBy(order.field, <OrderByDirection>order.direction.toLowerCase());
            return true;
          }
          return false;
        })
      ) {
        this.log("WARN", "Skip orderBy as the range attribute is not within ORDER BY expression");
        // If rangeAttribute is not in orderBy then skip the orderBy completely
        return query;
      }
    }
    // Add remaining orderBy from index
    orderBy
      .filter(order => order.field !== rangeAttribute)
      .forEach(order => {
        if (!orders || orders[order.field].has(<OrderByDirection>order.direction.toLowerCase())) {
          query = query.orderBy(order.field, <OrderByDirection>order.direction.toLowerCase());
        } else {
          this.log("WARN", "Skip orderBy as the direction does not match index");
        }
      });
    return query;
  }

  /** @override */
  async query(query: string | any): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    const parsed: WebdaQL.Query = typeof query === "string" ? WebdaQL.parse(query) : query;
    const { results, continuationToken } = await this.find(parsed);
    return { results, continuationToken };
  }

  /** @override */
  async *iterate(query: string): AsyncGenerator<InstanceType<T>, any, any> {
    const parsed = WebdaQL.parse(query);
    parsed.limit ??= 100;
    do {
      const res = await this.find(parsed);
      for (const item of res.results) {
        yield item;
      }
      parsed.continuationToken = res.continuationToken;
    } while (parsed.continuationToken);
  }

  /**
   * Delete every document of the collection (used in tests)
   */
  async clear(): Promise<void> {
    const refs = await this.firestore.collection(this.collection).listDocuments();
    for (let i = 0; i < refs.length; i += 500) {
      const batch = this.firestore.batch();
      refs.slice(i, i + 500).forEach(ref => batch.delete(ref));
      await batch.commit();
    }
  }
}

/**
 * Implement Firebase abstraction within Webda
 *
 * @WebdaModda GoogleCloudFireStore
 */
export default class FireStore<K extends FireStoreParameters = FireStoreParameters> extends Store<K> {
  firestore: Firestore;

  /**
   * Create the Firestore client
   * @override
   */
  computeParameters(): void {
    super.computeParameters();
    this.firestore ??= new Firestore({ ignoreUndefinedProperties: true });
  }

  /**
   * Terminate the Firestore client
   * @override
   */
  async stop(): Promise<void> {
    await this.firestore?.terminate().catch(() => {
      /* already terminated */
    });
    await super.stop();
  }

  /**
   * Resolve the collection name for a given model class
   *
   * Resolution order:
   * 1. `parameters.collections[meta.Identifier]` — explicit per-model override
   * 2. `parameters.collection` for the first model configured or when a single model is managed
   * 3. Default — model identifier lowercased with "/" replaced by "_"
   *
   * @param model - the model class
   * @returns the collection name
   */
  resolveCollection(model: ModelClass): string {
    const meta = useModelMetadata(model);
    if (!meta) {
      return this.parameters.collection;
    }
    if (this.parameters.collections?.[meta.Identifier]) {
      return this.parameters.collections[meta.Identifier];
    }
    if (
      this.parameters.collection &&
      ((this.parameters.models?.length ?? 0) <= 1 || this.parameters.models?.[0] === meta.Identifier)
    ) {
      return this.parameters.collection;
    }
    return meta.Identifier.toLowerCase().replace(/\//g, "_");
  }

  /**
   * Build and return a FireStoreRepository for the given model
   *
   * The result is cached per model class via `@InstanceCache`.
   * @param model - the model class
   * @returns a repository backed by Firestore
   */
  @InstanceCache()
  getRepository<T extends ModelClass>(model: T): Repository<T> {
    const meta = useModelMetadata(model);
    this.firestore ??= new Firestore({ ignoreUndefinedProperties: true });
    const inner = new FireStoreRepository<T>(
      model,
      meta.PrimaryKey,
      this.firestore,
      this.resolveCollection(model),
      this.parameters.compoundIndexes,
      (level, ...args) => this.log(level, ...args),
      meta.PrimaryKeySeparator
    );
    // Wrap in EventRepository so typed CRUD events fire; consumers reach them
    // via useRepository(model).on(...).
    return new EventRepository<T>(model, meta.PrimaryKey, inner, meta.PrimaryKeySeparator) as unknown as Repository<T>;
  }

  /**
   * Return the underlying FireStoreRepository for each model this store manages
   * @returns the per-model FireStoreRepository instances
   */
  getRepositories(): FireStoreRepository<any>[] {
    const repos: FireStoreRepository<any>[] = [];
    for (const modelId of Object.keys(this._modelsHierarchy ?? {})) {
      let model: ModelClass | undefined;
      try {
        model = useModel(modelId);
      } catch {
        continue;
      }
      if (!model) {
        continue;
      }
      const repo: any = this.getRepository(model);
      repos.push((repo.repository ?? repo) as FireStoreRepository<any>);
    }
    return repos;
  }

  /**
   * Delete every document of the managed collections (used in tests)
   */
  async __clean(): Promise<void> {
    const done = new Set<string>();
    for (const repo of this.getRepositories()) {
      if (done.has(repo.getCollection())) {
        continue;
      }
      done.add(repo.getCollection());
      await repo.clear();
    }
  }
}

export { FireStore };
