import { CoreModel, Service, Store, WebdaError } from "@webda/core";
import { Client } from "@elastic/elasticsearch";
import { ServiceParameters } from "../../core/lib/services/service";

interface IndexParameter {
  store: string;
  url: string;
}

interface IndexInfo extends IndexParameter {
  _store: Store;
  name: string;
}
class ElasticSearchServiceParameters extends ServiceParameters {
  /**
   * ClientOptions is not usable for now
   * ts-json-schema error
   */
  client: any;
  indexes: { [key: string]: IndexParameter };

  constructor(params: any) {
    super(params);
    this.indexes ??= {};
  }
}

export class ESUnknownIndexError extends WebdaError {
  constructor(index: string) {
    super("ES_UNKOWN_INDEX", `Unknown index "${index}"`);
  }
}

/**
 * Index a Store allowing you to query it through ES
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
   * @inheritdoc
   */
  loadParameters(params: any): ElasticSearchServiceParameters {
    return new ElasticSearchServiceParameters(params);
  }

  /**
   * @inheritdoc
   */
  resolve() {
    super.resolve();
    this._client = new Client(this.parameters.client);
    this.log("DEBUG", "Indexes", this.parameters.indexes);
    for (let i in this.parameters.indexes) {
      let index = (this.indexes[i] = {
        ...this.parameters.indexes[i],
        name: i,
        _store: this.getService<Store<CoreModel>>(this.parameters.indexes[i].store)
      });
      let store = index._store;
      if (!store) {
        this.log("ERROR", "Cannot initiate index", index.name, ": missing store", index.store);
        return;
      }
      this.log("INFO", "Setup the Store listeners");
      // Plug on every modification on the store to update the index accordingly
      store.on("Store.PartialUpdated", evt => {
        if (evt.partial_update.increment) {
          return this._increment(
            index.name,
            evt.object_id,
            evt.partial_update.increment.property,
            evt.partial_update.increment.value
          );
        } else if (evt.partial_update.addItem) {
          return this._addItem(
            index.name,
            evt.object_id,
            evt.partial_update.addItem.property,
            evt.partial_update.addItem.value
          );
        } else if (evt.partial_update.deleteItem) {
          return this._deleteItem(
            index.name,
            evt.object_id,
            evt.partial_update.deleteItem.property,
            evt.partial_update.deleteItem.index
          );
        } else if (evt.partial_update.deleteAttribute) {
          return this._deleteAttribute(index.name, evt.object_id, evt.partial_update.deleteAttribute);
        }
      });
      store.on("Store.Updated", evt => {
        return this._update(index.name, evt.object);
      });
      store.on("Store.PatchUpdated", evt => {
        return this._update(index.name, evt.object);
      });
      store.on("Store.Saved", async evt => {
        return this._create(index.name, evt.object);
      });
      store.on("Store.Deleted", evt => {
        return this._delete(index.name, evt.object.getUuid());
      });
    }
  }

  /**
   * Increment a property of an object
   *
   * @param index
   * @param uuid
   * @param property
   * @param increment
   */
  protected async _increment(index: string, uuid: string, property: string, increment: number) {
    await this._client.update({
      index,
      id: uuid,
      body: {
        script: {
          lang: "painless",
          source: `if (ctx._source.${property} != null) {
  ctx._source.${property} += params.count;
} else {
  ctx._source.${property} = params.count;
}`,
          params: { count: increment }
        }
      }
    });
  }

  /**
   * Add an element to an array of the document
   *
   * @param index
   * @param uuid
   * @param property
   * @param item
   */
  protected async _addItem(index: string, uuid: string, property: string, item: any) {
    await this._client.update({
      index,
      id: uuid,
      body: {
        script: {
          lang: "painless",
          source: `ctx._source.${property}.add(params.doc)`,
          params: { doc: item }
        }
      }
    });
  }

  /**
   * Delete an item from an array on the document
   *
   * @param index
   * @param uuid
   * @param property
   * @param element
   */
  protected async _deleteItem(index: string, uuid: string, property: string, element: number) {
    await this._client.update({
      index,
      id: uuid,
      body: {
        script: {
          lang: "painless",
          source: `ctx._source.${property}.remove(params.idx)`,
          params: { idx: element }
        }
      }
    });
  }

  /**
   * Delete an attribute from a document
   *
   * @param index
   * @param uuid
   * @param property
   */
  protected async _deleteAttribute(index: string, uuid: string, property: string) {
    await this._client.update({
      index,
      id: uuid,
      body: {
        script: {
          lang: "painless",
          source: `ctx._source.remove(params.property)`,
          params: { property }
        }
      }
    });
  }
  /**
   * Delete a document from the index
   *
   * @param index to delete from
   * @param uuid
   */
  protected async _delete(index: string, uuid: string) {
    await this._client.delete({
      index: index,
      id: uuid,
      refresh: this._refreshMode
    });
  }

  /**
   * Create a document in the index
   *
   * @param index
   * @param object
   */
  protected async _create(index: string, object: CoreModel) {
    await this._client.create({
      index: index,
      id: object.getUuid(),
      refresh: this._refreshMode,
      body: object.toStoredJSON(false)
    });
  }

  protected async _update(index: string, object: CoreModel) {
    await this._client.update({
      index: index,
      id: object.getUuid(),
      refresh: this._refreshMode,
      body: {
        doc: object.toStoredJSON(false)
      }
    });
  }

  /**
   * Check an index is available or throw an exception
   *
   * @param index
   * @returns
   */
  checkIndex(index: string): IndexInfo {
    if (!this.indexes[index]) {
      throw new ESUnknownIndexError(index);
    }
    return this.indexes[index];
  }

  async search(index: string, query: any, from: number = 0) {
    let idx = this.checkIndex(index);
    // Cannot import type from ES client easily
    let q: any = {};
    if (typeof query === "string") {
      q = { q: query, index: index };
    } else {
      q = { index: index, body: query };
    }
    q.from = from;
    let result = await this._client.search(q);
    let objects = [];
    for (let i in result.hits.hits) {
      let hit = result.hits.hits[i];
      // Get the model from the Store linked to the index
      // Might want to replace null by undefined
      objects.push(idx._store.initModel(hit._source));
    }
    return objects;
  }

  /**
   * Check if an object exists in the index
   *
   * @param index
   * @param uuid
   * @returns
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
   * @param index
   * @returns
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
   * @param mode
   */
  setRefreshMode(mode: boolean | "wait_for"): void {
    this._refreshMode = mode;
  }

  /**
   * Wait for all event to be processed
   */
  async flush(index: string): Promise<void> {
    await this._client.indices.flush({
      index
    });
  }

  /**
   * @inheritdoc
   */
  async __clean(): Promise<void> {
    await Promise.all(
      Object.values(this.indexes).map(async index => {
        await this._client.deleteByQuery({
          index: index.name,
          refresh: true,
          body: {
            query: {
              match_all: {}
            }
          }
        });
      })
    );
  }

  /**
   * Return ElasticSearch client
   */
  getClient(): Client {
    return this._client;
  }
}

export { ElasticSearchService };
