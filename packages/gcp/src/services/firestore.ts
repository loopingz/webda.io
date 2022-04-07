import { DocumentReference, FieldValue, Firestore, Timestamp } from "@google-cloud/firestore";
import {
  CoreModel,
  Store,
  StoreParameters,
  DeepPartial,
  StoreNotFoundError,
  UpdateConditionFailError,
} from "@webda/core";

/**
 * Firebase parameters
 */
export class FireStoreParameters extends StoreParameters {
  collection: string;
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
  _find(_request: any, _offset: any, _limit: any): Promise<CoreModel[]> {
    return this.getAll();
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
