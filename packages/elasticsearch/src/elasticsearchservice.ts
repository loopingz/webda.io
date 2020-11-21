import { CoreModel, Service, Store, WebdaError } from "@webda/core";
import * as elasticsearch from "elasticsearch";
import { ServiceParameters } from "../../core/lib/services/service";

class ElasticSearchServiceParameters extends ServiceParameters {
  server: string;
  indexes: any;
}
export default class ElasticSearchService<
  T extends ElasticSearchServiceParameters = ElasticSearchServiceParameters
> extends Service<T> {
  _client: elasticsearch.Client;
  _asyncCount: number = 0;
  _refreshMode: string = "false";

  resolve() {
    super.resolve();
    this._client = new elasticsearch.Client({
      host: this._params.server
    });
    this.log("INFO", "Indexes", this._params.indexes);
    this._params.indexes = this._params.indexes || {};
    for (let i in this._params.indexes) {
      let index = this._params.indexes[i];
      index.name = i;
      let store = (index._store = this.getService<Store<CoreModel>>(index.store));
      if (!store) {
        this.log("ERROR", "Cannot initiate index", index.index, ": missing store", index.store);
        return;
      }
      if (index.url) {
        this._addRoute(index.url, ["POST"], this._httpSearch);
      }
      this.log("INFO", "Setup the Store listeners");
      // Plug on every modification on the store to update the index accordingly
      store.on("Store.PartialUpdated", evt => {
        this._update(index.name, evt.object, evt.object[store.getUuidField()]);
      });
      store.on("Store.Updated", evt => {
        this._update(index.name, evt.object, evt.object[store.getUuidField()]);
      });
      store.on("Store.Saved", async evt => {
        this._create(index.name, evt.object, evt.object[store.getUuidField()]);
      });
      store.on("Store.Deleted", evt => {
        this._delete(index.name, evt.object, evt.object[store.getUuidField()]);
      });
    }
  }

  async _delete(index: string, object: CoreModel, uuid: string) {
    this._asyncCount++;
    try {
      await this._client.delete({
        index: index,
        id: uuid,
        refresh: this._refreshMode,
        type: index
      });
    } finally {
      this._asyncCount--;
    }
  }

  async _create(index: string, object: CoreModel, uuid: string) {
    this._asyncCount++;
    try {
      await this._client.create({
        index: index,
        id: uuid,
        type: index,
        refresh: this._refreshMode,
        body: object.toStoredJSON(false)
      });
    } finally {
      this._asyncCount--;
    }
  }

  async _update(index: string, object: CoreModel, uuid: string) {
    this._asyncCount++;
    try {
      await this._client.update({
        index: index,
        id: uuid,
        type: index,
        refresh: this._refreshMode,
        body: {
          doc: object.toStoredJSON(false)
        }
      });
    } finally {
      this._asyncCount--;
    }
  }

  _httpSearch(ctx) {}

  async search(index: string, query: any, from: number = 0) {
    if (!this._params.indexes[index]) {
      throw new WebdaError("ES_UNKOWN_INDEX", "Unknown index");
    }
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
      objects.push(this._params.indexes[index]._store.initModel(hit._source));
    }
    return objects;
  }

  static getObjectSize(obj: any): number {
    return JSON.stringify(obj).length;
  }

  static flatten(array: any[]) {
    if (array.length == 0) return array;
    else if (Array.isArray(array[0]))
      return ElasticSearchService.flatten(array[0]).concat(ElasticSearchService.flatten(array.slice(1)));
    else return [array[0]].concat(ElasticSearchService.flatten(array.slice(1)));
  }

  async bulk(index: string, objects: any) {
    let client = await this.getClient();
    let stats = { added: 0, updated: 0, errors: 0, errorsId: [] };
    try {
      if (Array.isArray(objects)) {
        // Manage size limit
        let items = objects.map(doc => [{ index: { _index: index, _id: doc.id } }, doc]);
        let current = 0;
        do {
          let push = [];
          let size = 0;
          do {
            push.push(items[current]);
            size += ElasticSearchService.getObjectSize(items[current]);
            current++;
          } while (size < 256 * 1024 && current < items.length);
          if (current < items.length - 1) {
            current--;
          }
          this.log("TRACE", "Pushing", push.length, "to ES");
          let res = await client.bulk({
            refresh: "true",
            body: ElasticSearchService.flatten(push)
          });
          res.body.items.forEach(r => {
            stats[r.result] = stats[r.result] || 0;
            stats[r.result]++;
          });
        } while (current < items.length);
      } else {
        await client.create({
          index,
          id: objects.uuid,
          body: objects
        });
      }
    } catch (err) {
      if (err.statusCode === 409) {
        return stats;
      }
      if (err.statusCode !== 409) {
        this.log("ERROR", "Cannot index", objects, err, JSON.stringify(err, undefined, 2));
      }
    }
    return stats;
  }

  async exists(index: string, uuid: string) {
    if (!this._params.indexes[index]) {
      throw new WebdaError("ES_UNKOWN_INDEX", "Unknown index");
    }
    return await this._client.exists({
      index: index,
      type: index,
      id: uuid
    });
  }

  async count(index: string = undefined) {
    if (!index) {
      return (await this._client.count()).count;
    }
    if (!this._params.indexes[index]) {
      throw new WebdaError("ES_UNKOWN_INDEX", "Unknown index");
    }
    return (await this._client.count({ index: index })).count;
  }

  async _wait() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this._asyncCount === 0);
      }, 100);
    });
  }

  async wait(timeout: number = 10000) {
    return new Promise<void>(async (resolve, reject) => {
      for (let i = 0; i < timeout; i += 100) {
        let res = await this._wait();
        if (res) {
          return resolve();
        }
      }
      reject();
    });
  }

  setRefreshMode(mode: string): void {
    this._refreshMode = mode;
  }

  async __clean() {
    for (let i in this._params.indexes) {
      let index = this._params.indexes[i];
      index.name = i;
      let store = (index._store = this.getService<Store<CoreModel>>(index.store));
      if (!store) {
        continue;
      }
      this._asyncCount++;
      await this._client.deleteByQuery({
        index: index.name,
        refresh: this._refreshMode,
        q: "*"
      });
      this._asyncCount--;
    }
  }

  getClient() {
    return this._client;
  }

  static getModda() {
    return {
      uuid: "Webda/ElasticSearchService",
      label: "ElasticSearchService",
      description: "Index a Store allowing you to query it through ES",
      documentation: "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
      configuration: {}
    };
  }
}

export { ElasticSearchService };
