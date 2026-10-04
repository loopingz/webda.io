import { Client } from "@elastic/elasticsearch";
import {
  Service,
  ServiceParameters,
  WebdaError,
  useModel,
  useRegistry,
  useRepository,
  type ModelClass,
  type Repository
} from "@webda/core";
import dateFormat from "dateformat";

/**
 * Index definition
 */
export interface IndexParameter {
  /**
   * Model to duplicate in elasticsearch
   */
  model: string;
  /**
   * To expose the index in the API
   */
  url?: string;
  /**
   * Split index by date
   *
   * Following Grafana convention
   */
  dateSplit?: {
    /**
     * If index key is stats
     * yearly: stats-YYYY
     * monthly: stats-YYYY.MM
     * weekly: stats-GGGG.WW
     * daily: stats-YYYY.MM.DD
     * hourly: stats-YYYY.MM.DD.HH
     *
     * With dateSplit enable some synchronization features won't be available
     * To get the right index of the document the attribute need to be known,
     * therefore the PartialUpdate and PatchUpdate will likely require to reload
     * the original object
     *
     * @default "monthly"
     */
    frequency?: "yearly" | "monthly" | "weekly" | "daily" | "hourly";
    /**
     * That contains the date field
     */
    attribute: string;
  };
}

/**
 * Index runtime information
 */
interface IndexInfo extends IndexParameter {
  /**
   * Model class indexed
   */
  _model: ModelClass;
  /**
   * Repository of the model
   */
  _repository: Repository<any>;
  /**
   * Listeners registered on the repository
   */
  _listeners: [string, (evt: any) => Promise<void>][];
  /**
   * Index name
   */
  name: string;
}

/**
 * Parameters for {@link ElasticSearchService}
 */
export class ElasticSearchServiceParameters extends ServiceParameters {
  /**
   * ClientOptions is not usable for now
   * ts-json-schema error
   */
  client: any;
  /**
   * Indexes to maintain, the key is the index name
   */
  indexes: { [key: string]: IndexParameter };

  /**
   * @override
   * @param params - the raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.indexes ??= {};
    // Ensure to default to monthly
    Object.values(this.indexes)
      .filter(i => i.dateSplit)
      .forEach(index => {
        index.dateSplit.frequency ??= "monthly";
      });
    return this;
  }
}

/**
 * Error thrown when an index is not defined
 */
export class ESUnknownIndexError extends WebdaError.CodeError {
  /**
   * @param index - the unknown index name
   */
  constructor(index: string) {
    super("ES_UNKOWN_INDEX", `Unknown index "${index}"`);
  }
}

/**
 * Index a Model allowing you to query it through ES
 *
 * @WebdaModda
 */
export default class ElasticSearchService<
  T extends ElasticSearchServiceParameters = ElasticSearchServiceParameters
> extends Service<T> {
  _client: Client;
  _refreshMode: boolean | "wait_for" = false;
  protected indexes: { [key: string]: IndexInfo } = {};

  /**
   * Create the ElasticSearch client
   * @override
   * @returns this
   */
  resolve(): this {
    super.resolve();
    this._client = new Client(this.parameters.client);
    return this;
  }

  /**
   * Listen to the repositories of the indexed models
   * @override
   * @returns this
   */
  async init(): Promise<this> {
    await super.init();
    this.setupIndexes();
    return this;
  }

  /**
   * Remove the repository listeners and close the client
   * @override
   */
  async stop(): Promise<void> {
    this.removeListeners();
    await this._client?.close();
    await super.stop();
  }

  /**
   * Remove all the repository listeners
   */
  protected removeListeners() {
    for (const index of Object.values(this.indexes)) {
      index._listeners.forEach(([event, listener]) => index._repository.off(<any>event, listener));
    }
    this.indexes = {};
  }

  /**
   * Resolve the indexed models and listen to their repositories events
   */
  protected setupIndexes() {
    this.removeListeners();
    this.log("DEBUG", "Indexes", this.parameters.indexes);
    for (const name in this.parameters.indexes) {
      const params = this.parameters.indexes[name];
      let model: ModelClass;
      try {
        model = <ModelClass>(<unknown>useModel(params.model));
      } catch (err) {
        this.log("ERROR", "Cannot initiate index", name, ": missing model", params.model);
        continue;
      }
      const index: IndexInfo = (this.indexes[name] = {
        ...params,
        name,
        _model: model,
        _repository: useRepository(model),
        _listeners: []
      });
      this.log("DEBUG", "Setup the Repository listeners for", name);
      index._listeners.push(
        ["Created", evt => this.onObject(index, evt.object_id, evt.object, true)],
        ["Updated", evt => this.onObject(index, evt.object_id, evt.object)],
        ["Patched", evt => this.onObject(index, evt.object_id, evt.object)],
        ["PartialUpdated", evt => this.onPartialUpdated(index, evt)],
        ["Deleted", evt => this.onDeleted(index, evt.object_id)]
      );
      index._listeners.forEach(([event, listener]) => index._repository.on(<any>event, listener));
    }
  }

  /**
   * Check if an object belongs to the indexed model
   *
   * The repository can be shared with parent or child models
   * @param index - the index information
   * @param uuid - the object primary key
   * @param object - the object if available
   * @returns true if the object should be indexed
   */
  protected async isIndexed(index: IndexInfo, uuid: string, object?: any): Promise<boolean> {
    if (index._repository.getRootModel() === index._model) {
      return true;
    }
    if (!(object instanceof index._model)) {
      object = await index._repository.get(uuid);
    }
    return object instanceof index._model;
  }

  /**
   * Index a created, updated or patched object
   * @param index - the index information
   * @param uuid - the object primary key
   * @param object - the object or the patched fields
   * @param create - true if the object was just created
   */
  protected async onObject(index: IndexInfo, uuid: string, object: any, create: boolean = false): Promise<void> {
    if (!(await this.isIndexed(index, uuid, object))) {
      return;
    }
    if (create) {
      await this._create(index.name, uuid, object);
    } else {
      await this._update(index.name, uuid, object);
    }
  }

  /**
   * Remove a deleted object from the index
   *
   * As the object is already deleted, it cannot be checked against the model
   * so a missing document is ignored
   * @param index - the index information
   * @param uuid - the deleted object primary key
   */
  protected async onDeleted(index: IndexInfo, uuid: string): Promise<void> {
    try {
      await this._delete(index.name, uuid);
    } catch (err) {
      if (err?.meta?.statusCode !== 404) {
        throw err;
      }
    }
  }

  /**
   * Replicate a partial update
   * @param index - the index information
   * @param evt - the PartialUpdated event
   */
  protected async onPartialUpdated(index: IndexInfo, evt: any): Promise<void> {
    if (!(await this.isIndexed(index, evt.object_id))) {
      return;
    }
    const update = evt.partial_update;
    if (update.increments) {
      const increments = Array.isArray(update.increments)
        ? update.increments.map(i => (typeof i === "string" ? { property: i, value: 1 } : { value: 1, ...i }))
        : Object.entries(update.increments).map(([property, value]) => ({ property, value: <number>value }));
      await this._increments(index.name, evt.object_id, increments);
    } else if (update.upsert_in_collection) {
      const { collection, item, index: idx } = update.upsert_in_collection;
      if (idx === undefined) {
        await this._addItem(index.name, evt.object_id, collection, item);
      } else {
        await this._setItem(index.name, evt.object_id, collection, idx, item);
      }
    } else if (update.delete_from_collection) {
      const { collection, index: idx } = update.delete_from_collection;
      await this._deleteItem(index.name, evt.object_id, collection, idx);
    } else if (update.remove_attribute) {
      await this._deleteAttribute(index.name, evt.object_id, update.remove_attribute.attribute);
    }
  }

  /**
   * Reindex a model
   * @param index - the index name
   */
  public async reindex(index: string) {
    const info = this.checkIndex(index);
    const key = `storeMigration.${this.getName()}.reindex.${index}`;
    const status: {
      continuationToken?: string;
      count?: number;
      errors?: number;
    } = <any>await useRegistry().get(key, {});
    status.count ??= 0;
    status.errors ??= 0;
    // Bulk reindex
    do {
      const page = await useRepository(info._model).query(
        status.continuationToken ? `LIMIT 1000 OFFSET "${status.continuationToken}"` : "LIMIT 1000"
      );
      await this._client.helpers.bulk({
        datasource: page.results.filter(r => r instanceof info._model),
        onDocument: (doc: any) => {
          return [
            {
              update: {
                _index: index,
                _id: info._repository.getUID(doc)
              }
            },
            { doc_as_upsert: true }
          ];
        },
        onDrop: doc => {
          /* c8 ignore next 3 - do not know how to trigger this one */
          status.errors++;
          this.log("ERROR", "Failed to reindex doc", info._repository.getUID(doc.document), doc.error);
        },
        refresh: this._refreshMode
      });
      status.count += page.results.length;
      status.continuationToken = page.continuationToken;
      this.log("INFO", `${key}: Migrated ${status.count} items: ${status.errors} in errors`);
      await useRegistry().put(key, {
        count: status.count,
        errors: status.errors,
        continuationToken: status.continuationToken
      });
    } while (status.continuationToken);
  }

  /**
   * Increments one or several properties of an object
   *
   * @param index - the index name
   * @param uuid - the document id
   * @param parameters - the properties to increment
   */
  protected async _increments(index: string, uuid: string, parameters: { property: string; value: number }[]) {
    const params = {};
    parameters.forEach(({ value }, i) => {
      params[`count${i}`] = value;
    });
    await this._client.update({
      index,
      id: uuid,
      refresh: this._refreshMode,
      script: {
        lang: "painless",
        source: parameters
          .map(
            ({ property }, i) => `if (ctx._source.${property} != null) {
  ctx._source.${property} += params.count${i};
} else {
  ctx._source.${property} = params.count${i};
}`
          )
          .join("\n"),
        params
      }
    });
  }

  /**
   * Return the timed index for the target object
   * @param index - the index name
   * @param object - the object to index
   * @returns the index name including the date suffix if needed
   */
  getTimedIndex(index: string, object: any) {
    const indexInfo = this.checkIndex(index);
    if (!indexInfo.dateSplit) {
      return index;
    }
    const date = new Date(object[indexInfo.dateSplit.attribute]);

    switch (indexInfo.dateSplit.frequency) {
      case "yearly":
        return `${index}-${dateFormat(date, "UTC:yyyy")}`;
      case "monthly":
        return `${index}-${dateFormat(date, "UTC:yyyy.mm")}`;
      case "weekly":
        return `${index}-${dateFormat(date, "UTC:yyyy.WW")}`;
      case "daily":
        return `${index}-${dateFormat(date, "UTC:yyyy.mm.dd")}`;
      case "hourly":
        return `${index}-${dateFormat(date, "UTC:yyyy.mm.dd.HH")}`;
    }
  }

  /**
   * Return the timed index for an object stored in the repository
   * @param index - the index name
   * @param uuid - the object primary key
   * @returns the index name including the date suffix if needed
   */
  async getTimedIndexFromUuid(index: string, uuid: string) {
    const object = await this.checkIndex(index)._repository.get(uuid);
    return this.getTimedIndex(index, object);
  }

  /**
   * Add an element to an array of the document
   *
   * @param index - the index name
   * @param uuid - the document id
   * @param property - the array property
   * @param item - the item to add
   */
  protected async _addItem(index: string, uuid: string, property: string, item: any) {
    await this._client.update({
      index,
      id: uuid,
      refresh: this._refreshMode,
      script: {
        lang: "painless",
        source: `if (ctx._source.${property} == null) { ctx._source.${property} = []; } ctx._source.${property}.add(params.doc)`,
        params: { doc: this.toDocument(item) }
      }
    });
  }

  /**
   * Replace an element of an array of the document
   *
   * @param index - the index name
   * @param uuid - the document id
   * @param property - the array property
   * @param idx - the position to replace
   * @param item - the new item
   */
  protected async _setItem(index: string, uuid: string, property: string, idx: number, item: any) {
    await this._client.update({
      index,
      id: uuid,
      refresh: this._refreshMode,
      script: {
        lang: "painless",
        source: `ctx._source.${property}.set(params.idx, params.doc)`,
        params: { idx, doc: this.toDocument(item) }
      }
    });
  }

  /**
   * Delete an item from an array on the document
   *
   * @param index - the index name
   * @param uuid - the document id
   * @param property - the array property
   * @param element - the position to remove
   */
  protected async _deleteItem(index: string, uuid: string, property: string, element: number) {
    await this._client.update({
      index,
      id: uuid,
      refresh: this._refreshMode,
      script: {
        lang: "painless",
        source: `ctx._source.${property}.remove(params.idx)`,
        params: { idx: element }
      }
    });
  }

  /**
   * Delete an attribute from a document
   *
   * @param index - the index name
   * @param uuid - the document id
   * @param property - the attribute to remove
   */
  protected async _deleteAttribute(index: string, uuid: string, property: string) {
    await this._client.update({
      index,
      id: uuid,
      refresh: this._refreshMode,
      script: {
        lang: "painless",
        source: `ctx._source.remove(params.property)`,
        params: { property }
      }
    });
  }

  /**
   * Delete a document from the index
   *
   * @param index - the index to delete from
   * @param uuid - the document id
   */
  protected async _delete(index: string, uuid: string) {
    await this._client.delete({
      index: index,
      id: uuid,
      refresh: this._refreshMode
    });
  }

  /**
   * Convert an object to a plain JSON document
   * @param object - the object to convert
   * @returns the JSON document
   */
  protected toDocument(object: any): any {
    return object === undefined ? undefined : JSON.parse(JSON.stringify(object));
  }

  /**
   * Create a document in the index
   *
   * @param index - the index name
   * @param uuid - the document id
   * @param object - the object to index
   */
  protected async _create(index: string, uuid: string, object: any) {
    await this._client.index({
      index: index,
      id: uuid,
      refresh: this._refreshMode,
      document: this.toDocument(object)
    });
  }

  /**
   * Update a document in the index, creating it if needed
   *
   * @param index - the index name
   * @param uuid - the document id
   * @param object - the fields to update
   */
  protected async _update(index: string, uuid: string, object: any) {
    await this._client.update({
      index: index,
      id: uuid,
      refresh: this._refreshMode,
      doc: this.toDocument(object),
      doc_as_upsert: true
    });
  }

  /**
   * Check an index is available or throw an exception
   *
   * @param index - the index name
   * @returns the index information
   */
  checkIndex(index: string): IndexInfo {
    if (!this.indexes[index]) {
      throw new ESUnknownIndexError(index);
    }
    return this.indexes[index];
  }

  /**
   * Search on Elastic search
   * @param index - the index name
   * @param query - a query string or an ES query body
   * @param from - offset of the first result
   * @returns the models found
   */
  async search<K = any>(index: string, query: any, from: number = 0): Promise<K[]> {
    const idx = this.checkIndex(index);
    // Cannot import type from ES client easily
    let q: any = {};
    if (typeof query === "string") {
      q = { q: query, index: index };
    } else {
      q = { index: index, ...query };
    }
    q.from = from;
    const result = await this._client.search(q);
    // Build the model linked to the index
    return result.hits.hits.map(hit => <K>new (<any>idx._model)().load(hit._source));
  }

  /**
   * Check if an object exists in the index
   *
   * @param index - the index name
   * @param uuid - the document id
   * @returns true if the document exists
   */
  async exists(index: string, uuid: string): Promise<boolean> {
    this.checkIndex(index);
    return (
      await this._client.exists({
        index: index,
        id: uuid
      })
    ).valueOf();
  }

  /**
   * Count all objects inside ES
   * or if an index is defined all the objects from an index
   *
   * @param index - the index name
   * @returns the number of documents
   */
  async count(index: string = undefined): Promise<number> {
    if (!index) {
      return (await this._client.count()).count;
    }
    this.checkIndex(index);
    return (await this._client.count({ index: index })).count;
  }

  /**
   * Set the global type of refreshMode
   * @param mode - the refresh mode
   */
  setRefreshMode(mode: boolean | "wait_for"): void {
    this._refreshMode = mode;
  }

  /**
   * Wait for all event to be processed
   * @param index - the index name
   */
  async flush(index: string): Promise<void> {
    await this._client.indices.refresh({
      index,
      ignore_unavailable: true
    });
  }

  /**
   * Remove all documents from the indexes
   */
  async __clean(): Promise<void> {
    await Promise.all(
      Object.values(this.indexes).map(async index => {
        await this._client.deleteByQuery({
          index: index.name,
          refresh: true,
          ignore_unavailable: true,
          query: {
            match_all: {}
          }
        });
        await this.flush(index.name);
      })
    );
  }

  /**
   * Return ElasticSearch client
   * @returns the client
   */
  getClient(): Client {
    return this._client;
  }
}

export { ElasticSearchService };
