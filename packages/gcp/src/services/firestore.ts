import { DocumentReference, FieldValue, Firestore, Timestamp } from "@google-cloud/firestore";
import {
  CoreModel,
  Store,
  StoreParameters,
  DeepPartial,
  StoreNotFoundError,
  UpdateConditionFailError,
  WebdaQL,
  StoreFindResult,
} from "@webda/core";

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
  compoundIndexes: string[][];
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

  /**
   * @override
   */
  loadParameters(params: DeepPartial<T>): FireStoreParameters {
    return new FireStoreParameters(params, this);
  }

  /**
   * @override
   */
  async init() {
    await super.init();
    this.firestore = new Firestore();
    this.firestore.settings({ ignoreUndefinedProperties: true });
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
  async find(
    expression: WebdaQL.Expression,
    continuationToken: string = "0",
    limit: number = 1000
  ): Promise<StoreFindResult<T>> {
    console.log("QUERY", expression.toString());
    let offset: number = parseInt(continuationToken);
    if (isNaN(offset)) {
      offset = 0;
    }
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.firestore
      .collection(this.parameters.collection)
      .limit(limit);
    if (offset) {
      query = query.offset(offset);
    }

    let filter = new WebdaQL.AndExpression([]);
    let rangeAttribute;
    let toProcess: WebdaQL.AndExpression;
    if (!(expression instanceof WebdaQL.AndExpression)) {
      toProcess = new WebdaQL.AndExpression([expression]);
    } else {
      toProcess = expression;
    }
    const queryAttributes = new Set<string>();
    let count = 0;
    let hasIn = false;
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
      let attribute = child.attribute.join(".");
      if (queryAttributes.size === 0) {
        queryAttributes.add(attribute);
      }
      // Translate operators
      if (["=", "IN"].includes(child.operator)) {
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
            this.log("WARN", "Firebase cannot have two 'in' clause");
            filter.children.push(child);
          }
          hasIn = true;
        }
      } else {
        // Requires compoundIndex
        if (child.operator !== "!=") {
          rangeAttribute ??= attribute;
          // Range need to apply on only one attribute
          if (rangeAttribute !== attribute) {
            filter.children.push(child);
            return;
          }
          operator = child.operator;
        }
      }
      // count++;
      query = query.where(attribute, operator, child.value);
    });

    const res = await query.get();
    return {
      results: res.docs.map(d => this.initModel(d.data())),
      filter: filter.children.length ? filter : true,
      continuationToken: res.docs.length >= limit ? (offset + limit).toString() : undefined,
    };
  }

  /**
   * @override
   */
  async exists(uid: string): Promise<boolean> {
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
   * @override
   */
  async _get(uid: string, raiseIfNotFound?: boolean): Promise<T> {
    let doc = (await this.getDocumentRef(uid).get()).data();
    if (!doc) {
      if (raiseIfNotFound) {
        throw new StoreNotFoundError(uid, this.getName());
      }
      return undefined;
    }
    return this.initModel(doc);
  }

  /**
   * @override
   */
  async getAll(list?: string[]): Promise<T[]> {
    let res = [];
    if (list) {
      res = (await this.firestore.collection(this.parameters.collection).where("uuid", "in", list).get()).docs;
    } else {
      res = await this.firestore.collection(this.parameters.collection).listDocuments();
    }
    return res.map(this.initModel, this);
  }

  /**
   * @override
   */
  async _update(object: any, uid: string, itemWriteCondition?: any, itemWriteConditionField?: string): Promise<any> {
    await this._setDocument(false, object, uid, itemWriteCondition, itemWriteConditionField);
  }

  protected checkCondition(uid: string, data: any, field: string, condition: any): void {
    if (condition) {
      let values = [data[field], condition].map(i => (i instanceof Timestamp ? i.toMillis() : i));
      if (values[0] !== values[1]) {
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
    if (object instanceof CoreModel) {
      update = object.toStoredJSON();
    }
    await this.firestore.runTransaction(async t => {
      const docRef = this.getDocumentRef(uid);
      const doc = await t.get(docRef);
      if (!doc.exists) {
        throw new StoreNotFoundError(uid, this.getName());
      }
      this.checkCondition(uid, doc.data(), itemWriteConditionField, itemWriteCondition);
      t.set(docRef, update, {
        merge,
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
        [attribute]: FieldValue.delete(),
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
  async _incrementAttribute(uid: string, prop: string, value: number, updateDate: Date): Promise<any> {
    try {
      await this.getDocumentRef(uid).update({
        [prop]: FieldValue.increment(value),
        [this._lastUpdateField]: updateDate,
      });
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
          [this._lastUpdateField]: updateDate,
        });
      });
    } else {
      try {
        await this.getDocumentRef(uid).update({
          [prop]: FieldValue.arrayUnion(item),
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
        [this._lastUpdateField]: updateDate,
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
