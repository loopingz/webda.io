import { Client } from "@elastic/elasticsearch";
import {
  CoreModel,
  CoreModelDefinition,
  RegistryEntry,
  Service,
  ServiceParameters,
  Store,
  WebdaError
} from "@webda/core";
import dateFormat from "dateformat";

interface IndexParameter {
  /**
   * Store to duplicate in elasticsearch
   * @deprecated
   */
  store: string;
  /**
   * Use a model instead of a store
   */
  model: string;
  /**
   * To expose the index in the API
   */
  url: string;
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

interface IndexInfo extends IndexParameter {
  _store?: Store;
  _model?: CoreModelDefinition;
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
    // Ensure to default to monthly
    Object.values(this.indexes)
      .filter(i => i.dateSplit)
      .forEach(index => {
        index.dateSplit.frequency ??= "monthly";
      });
  }
}

export class ESUnknownIndexError extends WebdaError.CodeError {
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
  resolve(): this {
    super.resolve();
    this._client = new Client(this.parameters.client);
    this.log("DEBUG", "Indexes", this.parameters.indexes);
    for (const i in this.parameters.indexes) {
      let index;

      const partialUpdatedListener = evt => {
        if (evt.partial_update.increments) {
          return this._increments(index.name, evt.object_id, evt.partial_update.increments);
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
      };
      const updatedListener = evt => {
        return this._update(index.name, evt.object);
      };
      const savedListener = evt => {
        return this._create(index.name, evt.object);
      };
      const deletedListener = evt => {
        return this._delete(index.name, evt.object.getUuid());
      };

      if (this.parameters.indexes[i].store) {
        index = this.indexes[i] = {
          ...this.parameters.indexes[i],
          name: i,
          _store: this.getService<Store<CoreModel>>(this.parameters.indexes[i].store)
        };
        const store = index._store;

        if (!store) {
          this.log("ERROR", "Cannot initiate index", index.name, ": missing store", index.store);
          continue;
        }

        this.log("DEBUG", "Setup the Store listeners");
        store.on("Store.PartialUpdated", partialUpdatedListener);
        store.on("Store.Updated", updatedListener);
        store.on("Store.PatchUpdated", updatedListener);
        store.on("Store.Saved", savedListener);
        store.on("Store.Deleted", deletedListener);
      } else if (this.parameters.indexes[i].model) {
        index = this.indexes[i] = {
          ...this.parameters.indexes[i],
          name: i,
          _model: this.getWebda().getModels()[this.parameters.indexes[i].model]
        };
        const model = <CoreModelDefinition>index._model;

        if (!model) {
          this.log("ERROR", "Cannot initiate index", index.name, ": missing model", index.model);
          continue;
        }
        // Set the store
        index._store = model.store();
        this.log("DEBUG", "Setup the Model listeners");
        model.on("Store.PartialUpdated", partialUpdatedListener);
        model.on("Store.Updated", updatedListener);
        model.on("Store.PatchUpdated", updatedListener);
        model.on("Store.Saved", savedListener);
        model.on("Store.Deleted", deletedListener);
      }
    }
    return this;
  }

  /**
   * Reindex a store
   * @param index
   */
  public async reindex(index: string) {
    const info = this.indexes[index];
    if (!info) {
      throw new ESUnknownIndexError(index);
    }
    const store = info._store;
    const status: RegistryEntry<{
      continuationToken?: string;
      count: number;
      errors: number;
      done: boolean;
    }> = await this.getWebda().getRegistry().get(`storeMigration.${this.getName()}.reindex.${index}`, undefined, {});
    status.count ??= 0;
    status.errors ??= 0;
    // Bulk reindex
    do {
      const page = await store.query(
        status.continuationToken ? `LIMIT 1000 OFFSET ${status.continuationToken}` : "LIMIT 1000"
      );
      await this._client.helpers.bulk({
        datasource: page.results.filter(r => (info._model ? r instanceof info._model : true)),
        onDocument: doc => {
          return [
            {
              update: {
                _index: index,
                _id: doc.getUuid()
              }
            },
            { doc_as_upsert: true }
          ];
        },
        onDrop: doc => {
          /* c8 ignore next 3 - do not know how to trigger this one */
          status.errors++;
          this.log("ERROR", "Failed to reindex doc", doc.document.getUuid(), doc.error);
        },
        refresh: this._refreshMode
      });
      status.count += page.results.length;
      status.continuationToken = page.continuationToken;
      this.log(
        "INFO",
        `storeMigration.${this.getName()}.reindex.${index}: Migrated ${status.count} items: ${status.errors} in errors`
      );
      await status.save();
    } while (status.continuationToken);
  }

  /**
   * Increments one or several properties of an object
   *
   * @param index
   * @param uuid
   */
  protected async _increments(index: string, uuid: string, parameters: { property: string; value: number }[]) {
    const params = {};
    parameters.forEach(({ value }, i) => {
      params[`count${i}`] = value;
    });
    await this._client.update({
      index,
      id: uuid,
      body: {
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
      }
    });
  }

  /**
   * Return the timed index for the target object
   * @param index
   * @param object
   * @returns
   */
  getTimedIndex(index: string, object: CoreModel) {
    if (!this.indexes[index]) {
      throw new ESUnknownIndexError(index);
    }
    const indexInfo = this.indexes[index];
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
   *
   * @param index
   * @param uuid
   * @returns
   */
  async getTimedIndexFromUuid(index: string, uuid: string) {
    const object = await this.indexes[index]._store.get(uuid);
    return this.getTimedIndex(index, object);
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

  /**
   * Search on Elastic search
   * @param index
   * @param query
   * @param from
   * @returns
   */
  async search<T extends CoreModel = CoreModel>(index: string, query: any, from: number = 0): Promise<T[]> {
    const idx = this.checkIndex(index);
    // Cannot import type from ES client easily
    let q: any = {};
    if (typeof query === "string") {
      q = { q: query, index: index };
    } else {
      q = { index: index, body: query };
    }
    q.from = from;
    const result = await this._client.search(q);
    const objects = [];
    for (const i in result.hits.hits) {
      const hit = result.hits.hits[i];
      // Get the model from the Store linked to the index
      // Might want to replace null by undefined
      objects.push(idx._store.newModel(hit._source));
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
        await this.flush(index.name);
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
