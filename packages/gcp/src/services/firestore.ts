import { DocumentReference, FieldValue, Firestore, OrderByDirection, Timestamp } from "@google-cloud/firestore";
import {
  CoreModel,
  DeepPartial,
  JSONUtils,
  Store,
  StoreFindResult,
  StoreNotFoundError,
  StoreParameters,
  UpdateConditionFailError
} from "@webda/core";
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
 * Firebase parameters
 */
export class FireStoreParameters extends StoreParameters {
  /**
   * Collection to use
   */
  collection: string;
  /**
   * To allow efficient query on several fields
   *
   * @see https://firebase.google.com/docs/firestore/query-data/queries
   */
  compoundIndexes: FireStoreIndex[];

  constructor(params: DeepPartial<FireStoreParameters>, service: Store) {
    super(params, service);
    // Default to empty compoundIndexes
    this.compoundIndexes ??= [];
  }
}

/**
 * Implement Firebase abstraction within Webda
 *
 * @WebdaModda GoogleCloudFireStore
 */
export default class FireStore<
  T extends CoreModel = CoreModel,
  K extends FireStoreParameters = FireStoreParameters
> extends Store<T, K> {
  firestore: Firestore;
  compoundIndexes: { [key: string]: FireStoreIndexOrder };

  /**
   * @override
   */
  loadParameters(params: DeepPartial<K>): FireStoreParameters {
    return new FireStoreParameters(params, this);
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    this.firestore = new Firestore({ ignoreUndefinedProperties: true });
    this.compoundIndexes = {};
    this.parameters.compoundIndexes.forEach(a => {
      const key = Object.keys(a).join("/");
      // Should contain the array of accessible order
      this.compoundIndexes[key] = {};
      Object.keys(a).forEach(field => {
        this.compoundIndexes[key][field] ??= new Set<"asc" | "desc">();
        this.compoundIndexes[key][field].add(a[field]);
      });
    });
    return this;
  }

  /**
   * Get Document Reference
   * @param uuid
   * @param collection
   * @returns
   */
  getDocumentRef(uuid: string, collection: string = this.parameters.collection): DocumentReference {
    return this.firestore.doc(`${collection}/${uuid}`);
  }

  /**
   * @override
   *
   * Return all for now
   */
  async find(parsedQuery: WebdaQL.Query): Promise<StoreFindResult<T>> {
    const offset: number = parseInt(parsedQuery.continuationToken || "0");
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.firestore.collection(
      this.parameters.collection
    );
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
    const queryAttributes = new Set<string>();
    const count = 0;
    let hasIn = false;
    let hasContains = false;
    toProcess.children.forEach((child: WebdaQL.Expression) => {
      if (!(child instanceof WebdaQL.ComparisonExpression) || count) {
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
      let operator: FirebaseFirestore.WhereFilterOp;
      const attribute = child.attribute.join(".");
      queryAttributes.add(attribute);
      // CONTAINS -> array_contains
      // Translate operators
      if (["=", "IN", "CONTAINS"].includes(child.operator)) {
        // = is permitted on every fields
        // if rangeQuery then need to check indexes
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
        } else if (child.operator === "CONTAINS") {
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
        if (child.operator !== "!=") {
          // Check compoundIndex exist
          rangeAttribute ??= attribute;
          // Range need to apply on only one attribute
          if (rangeAttribute !== attribute) {
            filter.children.push(child);
            return;
          }
        }
        operator = child.operator;
      }
      query = query.where(attribute, operator, child.value);
    });

    // OrderBy have quite some complexity with FireStore
    query = this.handleOrderBy(query, parsedQuery.orderBy, rangeAttribute);

    const res = await query.limit(parsedQuery.limit || 1000).get();
    return {
      results: res.docs.map(d => this.initModel(this.giveDatesBack(d.data()))),
      filter: filter.children.length ? filter : true,
      continuationToken: res.docs.length >= parsedQuery.limit ? (offset + parsedQuery.limit).toString() : undefined
    };
  }

  /**
   * Manage OrderBy complex condition on Firebase
   * @param query
   * @param orderBy
   * @param rangeAttribute
   * @param index
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

  /**
   * @override
   */
  async _exists(uid: string): Promise<boolean> {
    return (await this.getDocumentRef(uid).get()).exists;
  }

  /**
   * @override
   */
  async _delete(uid: string, writeCondition?: any, itemWriteConditionField?: string): Promise<void> {
    await this.firestore.runTransaction(async t => {
      const docRef = this.getDocumentRef(uid);
      const doc = (await t.get(docRef)).data();
      if (writeCondition && doc[itemWriteConditionField] !== writeCondition) {
        throw new UpdateConditionFailError(uid, itemWriteConditionField, writeCondition);
      }
      t.delete(docRef);
    });
  }

  /**
   * Recursively replace Timestamp by Date
   * @param doc
   * @returns
   */
  giveDatesBack(doc) {
    if (doc instanceof Timestamp) {
      return doc.toDate();
    } else if (Array.isArray(doc)) {
      return doc.map(d => this.giveDatesBack(d));
    } else if (doc instanceof Object) {
      const res = {};
      Object.keys(doc).forEach(k => {
        res[k] = this.giveDatesBack(doc[k]);
      });
      return res;
    } else {
      return doc;
    }
  }

  /**
   * @override
   */
  async _get(uid: string, raiseIfNotFound?: boolean): Promise<T> {
    const doc = (await this.getDocumentRef(uid).get()).data();
    if (!doc) {
      if (raiseIfNotFound) {
        throw new StoreNotFoundError(uid, this.getName());
      }
      return undefined;
    }

    return this.initModel(this.giveDatesBack(doc));
  }

  /**
   * @override
   */
  async getAll(list?: string[]): Promise<T[]> {
    let res = [];
    if (list) {
      res = (await this.firestore.collection(this.parameters.collection).where("uuid", "in", list).get()).docs;
    } else {
      // Limit to 1M docs
      res = (await this.firestore.collection(this.parameters.collection).limit(1000000).get()).docs;
    }
    return res.map(doc => this.initModel(this.giveDatesBack(doc.data())));
  }

  /**
   * @override
   */
  async _update(object: any, uid: string, itemWriteCondition?: any, itemWriteConditionField?: string): Promise<any> {
    await this._setDocument(false, object, uid, itemWriteCondition, itemWriteConditionField);
  }

  protected checkCondition(uid: string, data: any, field: string, condition: any): void {
    if (condition) {
      const current = data[field] instanceof Timestamp ? data[field].toDate().toISOString() : data[field];
      if (condition instanceof Date) {
        condition = condition.toISOString();
      }
      if (current !== condition) {
        throw new UpdateConditionFailError(uid, field, condition);
      }
    }
  }
  /***
   * Internal function that implement both update and patch
   */
  protected async _setDocument(
    merge: boolean,
    object: any,
    uid: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ) {
    let update = object;
    // Ensure we send pure prototype
    if (object.toStoredJSON && typeof object.toStoredJSON === "function") {
      update = object.toStoredJSON();
    } else {
      update = JSONUtils.duplicate(object);
    }
    await this.firestore.runTransaction(async t => {
      const docRef = this.getDocumentRef(uid);
      const doc = await t.get(docRef);
      if (!doc.exists) {
        throw new StoreNotFoundError(uid, this.getName());
      }
      this.checkCondition(uid, doc.data(), itemWriteConditionField, itemWriteCondition);
      t.set(docRef, update, {
        merge
      });
    });
  }

  /**
   * @override
   */
  async _patch(object: any, uid: string, itemWriteCondition?: any, itemWriteConditionField?: string): Promise<any> {
    await this._setDocument(true, object, uid, itemWriteCondition, itemWriteConditionField);
  }

  /**
   * @override
   */
  async _removeAttribute(
    uuid: string,
    attribute: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ): Promise<void> {
    await this.firestore.runTransaction(async t => {
      const docRef = this.getDocumentRef(uuid);
      const doc = await t.get(docRef);
      if (!doc.exists) {
        throw new StoreNotFoundError(uuid, this.getName());
      }
      this.checkCondition(uuid, doc.data(), itemWriteConditionField, itemWriteCondition);
      t.update(docRef, {
        [attribute]: FieldValue.delete()
      });
    });
  }

  /**
   * @override
   */
  async _save(object: T): Promise<any> {
    await this.getDocumentRef(object.getUuid()).set(object.toStoredJSON());
    return object;
  }

  /**
   * @override
   */
  async _incrementAttributes(
    uid: string,
    params: { property: string; value: number }[],
    updateDate: Date
  ): Promise<any> {
    try {
      const args: any = {
        ["_lastUpdate"]: updateDate
      };
      params.forEach(p => {
        args[p.property] = FieldValue.increment(p.value);
      });
      await this.getDocumentRef(uid).update(args);
    } catch (err) {
      if (err.code === 5) {
        throw new StoreNotFoundError(uid, this.getName());
      }
      throw err;
    }
  }

  /**
   * @override
   */
  async _upsertItemToCollection(
    uid: string,
    prop: string,
    item: any,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any> {
    if (index !== undefined) {
      await this.firestore.runTransaction(async t => {
        const docRef = this.getDocumentRef(uid);
        const doc = await t.get(docRef);
        if (!doc.exists) {
          throw new StoreNotFoundError(uid, this.getName());
        }
        const data = doc.data();
        this.checkCondition(uid, data[prop][index], itemWriteConditionField, itemWriteCondition);
        data[prop][index] = item;
        t.update(docRef, {
          [prop]: data[prop],
          ["_lastUpdate"]: updateDate
        });
      });
    } else {
      try {
        await this.getDocumentRef(uid).update({
          [prop]: FieldValue.arrayUnion(item)
        });
      } catch (err) {
        if (err.code === 5) {
          throw new StoreNotFoundError(uid, this.getName());
        }
        throw err;
      }
    }
  }

  /**
   * @override
   */
  async _deleteItemFromCollection(
    uid: string,
    prop: string,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any> {
    await this.firestore.runTransaction(async t => {
      const docRef = this.getDocumentRef(uid);
      const doc = await t.get(docRef);
      if (!doc.exists) {
        throw new StoreNotFoundError(uid, this.getName());
      }
      const data = doc.data();
      this.checkCondition(uid, data[prop][index], itemWriteConditionField, itemWriteCondition);
      // Get item from doc?
      t.update(docRef, {
        [prop]: FieldValue.arrayRemove(data[prop][index]),
        ["_lastUpdate"]: updateDate
      });
    });
  }

  /**
   * @override
   */
  async __clean() {
    // Empty on purpose, unit test use custom collection each time
  }
}

export { FireStore };
