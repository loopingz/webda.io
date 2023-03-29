import {
  CoreModel,
  Store,
  StoreFindResult,
  StoreNotFoundError,
  StoreParameters,
  UpdateConditionFailError,
  WebdaQL
} from "@webda/core";
import { Collection, Db, DbOptions, Document, MongoClient, ObjectId } from "mongodb";

export class MongoParameters extends StoreParameters {
  constructor(params: any, service: Store) {
    super(params, service);
    this.mongoUrl ??= process.env["WEBDA_MONGO_URL"];
    if (this.mongoUrl === undefined) {
      throw new Error("An URL is required for MongoDB service");
    }
    this.options ??= {};
  }

  /**
   * Contains the URL to Mongo Server
   *
   * Will try to use WEBDA_MONDO_URL environment variable if not defined
   */
  mongoUrl?: string;
  /**
   * Additional options for Mongo connetion
   *
   * Should be typed with MongoClientOptions but not available due to bug in ts-json-schema-generator
   * https://docs.mongodb.com/manual/reference/connection-string
   */
  options?: any;
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
 * @WebdaModda
 */
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
        this._client = await new MongoClient(this.parameters.mongoUrl, this.parameters.options).connect();
        this._db = this._client.db(this.parameters.database, this.parameters.databaseOptions);
        this._collection = this._db.collection(this.parameters.collection);
      })();
    }
    return this._connectPromise;
  }

  /**
   * @override
   */
  async _exists(uid) {
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
    params["$set"]["_lastUpdate"] = new Date();
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
    params["$set"]["_lastUpdate"] = updateDate;
    params["$unset"][prop + "." + index] = 1;
    let res = await this._collection.updateOne(filter, params);
    if (res.matchedCount === 0) {
      throw new UpdateConditionFailError(uid, itemWriteConditionField, itemWriteCondition);
    }
    let remove = {
      $pull: {},
      $set: {}
    };
    remove["$set"]["_lastUpdate"] = updateDate;
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
  async _incrementAttributes(uid: string, parameters: { property: string; value: number }[], updateDate: Date) {
    await this._connect();
    let params = {
      $inc: {},
      $set: {}
    };
    params["$set"]["_lastUpdate"] = updateDate;
    parameters.forEach(p => {
      params["$inc"][p.property] = p.value;
    });
    let res = await this._collection.updateOne(
      {
        _id: {
          $eq: <ObjectId>(<unknown>uid)
        }
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
    let params = {};
    if (index === undefined) {
      params = {
        $push: {},
        $set: {}
      };
      params["$set"]["_lastUpdate"] = updateDate;
      params["$push"][prop] = item;
    } else {
      params = {
        $set: {}
      };
      params["$set"]["_lastUpdate"] = updateDate;
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
   * Get a mongodb query object from WebdaQL
   */
  mapExpression(expression: WebdaQL.Expression): any {
    if (expression instanceof WebdaQL.AndExpression) {
      let query: any = {};
      expression.children.forEach(e => {
        query = { ...query, ...this.mapExpression(e) };
      });
      return query;
    } else if (expression instanceof WebdaQL.OrExpression) {
      return {
        $or: expression.children.map(e => this.mapExpression(e))
      };
    } else if (expression instanceof WebdaQL.ComparisonExpression) {
      if (expression.operator === "=" || expression.operator === "CONTAINS") {
        // MongoDB use same syntax for exact match or contains for an array
        return {
          [expression.attribute.join(".")]: expression.value
        };
      } else if (expression.operator === "<") {
        return {
          [expression.attribute.join(".")]: { $lt: expression.value }
        };
      } else if (expression.operator === ">") {
        return {
          [expression.attribute.join(".")]: { $gt: expression.value }
        };
      } else if (expression.operator === "<=") {
        return {
          [expression.attribute.join(".")]: { $lte: expression.value }
        };
      } else if (expression.operator === ">=") {
        return {
          [expression.attribute.join(".")]: { $gte: expression.value }
        };
      } else if (expression.operator === "!=") {
        return {
          [expression.attribute.join(".")]: { $ne: expression.value }
        };
      } else if (expression.operator === "IN") {
        return {
          [expression.attribute.join(".")]: { $in: expression.value }
        };
      } else if (expression.operator === "LIKE") {
        return {
          [expression.attribute.join(".")]: WebdaQL.ComparisonExpression.likeToRegex(<string>expression.value)
        };
      }
    }
  }

  /**
   * @override
   */
  async find(query: WebdaQL.Query): Promise<StoreFindResult<T>> {
    await this._connect();
    let offset = parseInt(query.continuationToken);
    if (isNaN(offset)) {
      offset = 0;
    }
    let sortObject = {};
    if (query.orderBy) {
      query.orderBy.forEach(e => {
        sortObject[e.field] = e.direction === "ASC" ? 1 : -1;
      });
    }
    // We should be able to expression everything as an expression
    const results = (
      await this._collection
        .find(this.mapExpression(query.filter))
        .sort(sortObject)
        .skip(offset)
        .limit(query.limit || 1000)
        .toArray()
    ).map(doc => this.initModel(doc));
    return {
      results,
      continuationToken: results.length >= query.limit ? (offset + query.limit).toString() : undefined,
      filter: true
    };
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
