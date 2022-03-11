"use strict";
import { Store, CoreModel, StoreParameters, Modda, UpdateConditionFailError, StoreNotFoundError } from "@webda/core";
import { MongoClient, MongoClientOptions, DbOptions, Db, Collection, Document } from "mongodb";

export class MongoParameters extends StoreParameters {
  constructor(params: any, service: Store) {
    super(params, service);
    this.url ??= process.env["WEBDA_MONGO_URL"];
    if (this.url === undefined) {
      throw new Error("An URL is required for MongoDB service");
    }
    this.options ??= {};
  }

  /**
   * Contains the URL to Mongo Server
   *
   * Will try to use WEBDA_MONDO_URL environment variable if not defined
   */
  url?: string;
  /**
   * Additional options for Mongo connetion
   */
  options?: MongoClientOptions;
  /**
   * Which collection to use
   */
  collection: string;
  /**
   *
   */
  database?: string;
  /**
   * Mongo Database Options
   *
   * @see https://www.npmjs.com/package/mongodb
   */
  databaseOptions?: DbOptions;
}
/**
 * Store Objects in MongoDB
 *
 * Parameters:
 *   mongo: 'mongodb://127.0.0.1:27017' // If not found try to read WEBDA_MONGO_URL env variable
 *
 */
@Modda
export default class MongoStore<T extends CoreModel, K extends MongoParameters> extends Store<T, K> {
  /**
   * Connect promise
   */
  _connectPromise: Promise<any> = undefined;
  /**
   * Client
   */
  _client: MongoClient;
  _db: Db;
  _collection: Collection<Document>;

  /** @ignore */
  constructor(webda, name, options) {
    super(webda, name, options);
    this._connectPromise = undefined;
  }

  /**
   * @override
   */
  loadParameters(params: any) {
    return new MongoParameters(params, this);
  }

  /**
   * Connect to MongoDB if not already connected
   * @returns
   */
  async _connect() {
    if (this._connectPromise === undefined) {
      this._connectPromise = (async () => {
        this._client = await MongoClient.connect(this.parameters.url, this.parameters.options);
        this._db = this._client.db(this.parameters.database, this.parameters.databaseOptions);
        this._collection = this._db.collection(this.parameters.collection);
      })();
    }
    return this._connectPromise;
  }

  /**
   * @override
   */
  async exists(uid) {
    // Should use find + limit 1
    return (await this._get(uid)) !== undefined;
  }

  /**
   * Return a filter for Mongo command
   * @param uuid
   * @param itemWriteCondition
   * @param itemWriteConditionField
   * @returns
   */
  protected getFilter(uuid: string, itemWriteCondition?: any, itemWriteConditionField?: string): any {
    let filter = {
      _id: uuid
    };
    if (itemWriteCondition && itemWriteConditionField) {
      filter[itemWriteConditionField] = itemWriteCondition;
    }
    return filter;
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
    await this._connect();
    let filter = this.getFilter(uuid, itemWriteCondition, itemWriteConditionField);
    let params = {
      $unset: {},
      $set: {}
    };
    params["$set"][this._lastUpdateField] = new Date();
    params["$unset"][attribute] = 1;
    let res = await this._collection.updateOne(filter, params);
    if (res.matchedCount === 0) {
      if (itemWriteCondition) {
        throw new UpdateConditionFailError(uuid, itemWriteConditionField, itemWriteCondition);
      } else {
        throw new StoreNotFoundError(uuid, this.getName());
      }
    }
  }

  /**
   * @override
   */
  async _deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField, updateDate: Date) {
    await this._connect();

    let filter = {
      _id: uid
    };
    if (itemWriteCondition) {
      filter[prop + "." + index + "." + itemWriteConditionField] = itemWriteCondition;
    }
    let params = {
      $unset: {},
      $set: {}
    };
    params["$set"][this._lastUpdateField] = updateDate;
    params["$unset"][prop + "." + index] = 1;
    let res = await this._collection.updateOne(filter, params);
    if (res.matchedCount === 0) {
      throw new UpdateConditionFailError(uid, itemWriteConditionField, itemWriteCondition);
    }
    let remove = {
      $pull: {},
      $set: {}
    };
    remove["$set"][this._lastUpdateField] = updateDate;
    remove["$pull"][prop] = null;
    await this._collection.updateOne(
      {
        _id: uid
      },
      remove
    );
  }

  /**
   * @override
   */
  async _incrementAttribute(uid, prop, value, updateDate: Date) {
    await this._connect();
    var params = {
      $inc: {},
      $set: {}
    };
    params["$set"][this._lastUpdateField] = updateDate;
    params["$inc"][prop] = value;
    let res = await this._collection.updateOne(
      {
        _id: uid
      },
      params
    );
    if (res.matchedCount === 0) {
      throw new StoreNotFoundError(uid, this.getName());
    }
  }

  /**
   * @override
   */
  async _upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField, updateDate: Date) {
    await this._connect();
    let filter = {
      _id: uid
    };
    var params = {};
    if (index === undefined) {
      params = {
        $push: {},
        $set: {}
      };
      params["$set"][this._lastUpdateField] = updateDate;
      params["$push"][prop] = item;
    } else {
      params = {
        $set: {}
      };
      params["$set"][this._lastUpdateField] = updateDate;
      params["$set"][prop + "." + index] = item;
      filter[prop + "." + index + "." + itemWriteConditionField] = itemWriteCondition;
    }

    let res = await this._collection.updateOne(filter, params);
    if (res.matchedCount === 0) {
      if (itemWriteCondition) {
        throw new UpdateConditionFailError(uid, itemWriteConditionField, itemWriteCondition);
      } else {
        throw new StoreNotFoundError(uid, this.getName());
      }
    }
  }

  /**
   * @override
   */
  async _save(object) {
    if (object instanceof CoreModel) {
      object = object.toStoredJSON();
    }
    object._id = object.uuid;
    await this._connect();
    await this._collection.insertOne(object);
    return object;
  }

  /**
   * @override
   */
  async _find(request) {
    await this._connect();
    return (await this._collection.find(request).toArray()).map(doc => this.initModel(doc));
  }

  /**
   * @override
   */
  async _delete(uid: string, writeCondition?: any, itemWriteConditionField?: string): Promise<void> {
    await this._connect();
    await this._collection.deleteOne(this.getFilter(uid, writeCondition, itemWriteConditionField));
  }

  /**
   * @override
   */
  async _patch(object: any, uid: string, itemWriteCondition?: any, itemWriteConditionField?: string): Promise<void> {
    await this._connect();
    let res = await this._collection.updateOne(this.getFilter(uid, itemWriteCondition, itemWriteConditionField), {
      $set: object
    });
    if (res.matchedCount === 0) {
      throw new UpdateConditionFailError(uid, itemWriteConditionField, itemWriteCondition);
    }
  }

  /**
   * @override
   */
  async _update(object: any, uid: string, itemWriteCondition?: any, itemWriteConditionField?: string): Promise<any> {
    if (object instanceof CoreModel) {
      object = object.toStoredJSON();
    }

    await this._connect();
    let filter = this.getFilter(uid, itemWriteCondition, itemWriteConditionField);
    let res = await this._collection.updateOne(filter, {
      $set: object
    });
    if (res.matchedCount === 0) {
      throw new UpdateConditionFailError(uid, itemWriteConditionField, itemWriteCondition);
    }
    return object;
  }

  /**
   * @override
   */
  async getAll(uids) {
    await this._connect();

    let params: any = {};
    if (uids) {
      params._id = {
        $in: uids
      };
    }
    return (await this._collection.find(params).toArray()).map(doc => this.initModel(doc));
  }

  /**
   * @override
   */
  async _get(uid: string, raiseIfNotFound: boolean = false): Promise<T> {
    await this._connect();
    let res = await this._collection.findOne({
      _id: <unknown>uid
    });
    if (res === null) {
      if (raiseIfNotFound) {
        throw new StoreNotFoundError(uid, this.getName());
      }
      return undefined;
    }
    return this.initModel(res);
  }

  /**
   * @override
   */
  async __clean() {
    await this._connect();
    await this._collection.deleteMany(undefined);
  }
}

export { MongoStore };
