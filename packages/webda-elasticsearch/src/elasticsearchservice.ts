import {
  Executor, Store, CoreModel
} from 'webda';
import * as elasticsearch from 'elasticsearch';


export default class ElasticSearchService extends Executor {
  _client: elasticsearch.Client;
  _asyncCount: number = 0;
  _refreshMode: string = 'false';

  init() {
    this._client = new elasticsearch.Client({
      host: this._params.server
    });
    this.log('INFO', 'Indexes', this._params.indexes);
    this._params.indexes = this._params.indexes || {};
    for (let i in this._params.indexes) {
      let index = this._params.indexes[i];
      index.name = i;
      let store = index._store = <Store<CoreModel>> this.getService(index.store);
      if (!store) {
        this.log('ERROR', 'Cannot initiate index', index.index,': missing store', index.store);
        return;
      }
      if (index.url) {
        this._addRoute(index.url, ['POST'], this._httpSearch)
      }
      this.log('INFO', 'Setup the Store listeners');
      // Plug on every modification on the store to update the index accordingly
      store.on('Store.PartialUpdate', (evt) => {
        console.log('Store.PartialUpdate', evt);
        this._update(index.name, evt.object);
      });
      store.on('Store.Updated', (evt) => {
        this._update(index.name, evt.object);
      });
      store.on('Store.Saved', async (evt) => {
        this._create(index.name, evt.object);
      });
      store.on('Store.Deleted', (evt) => {
        this._delete(index.name, evt.object);
      });
    }
  }

  async _delete(index: string, object: CoreModel) {
    this._asyncCount++;
    try {
      await this._client.delete({
        index: index,
        id: object.uuid,
        refresh: this._refreshMode,
        type: index
      });
    } finally {
      this._asyncCount--;
    }
  }

  async _create(index: string, object: CoreModel) {
    this._asyncCount++;
    try {
      await this._client.create({
        index: index,
        id: object.uuid,
        type: index,
        refresh: this._refreshMode,
        body: object.toStoredJSON(false)
      });
    } finally {
      this._asyncCount--;
    }
  }

  async _update(index: string, object: CoreModel) {
    this._asyncCount++;
    try {
      await this._client.update({
        index: index,
        id: object.uuid,
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

  _httpSearch(ctx) {

  }

  async search(index: string, query: any, from: number = 0) {
    if (!this._params.indexes[index]) {
      throw new Error('Unknown index');
    }
    let q : any = {};
    if (typeof(query) === 'string') {
      q = {q: query, index: index};
    } else {
      q = {index: index, body: query};
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

  async exists(index: string, uuid: string) {
    if (!this._params.indexes[index]) {
      throw new Error('Unknown index');
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
      throw new Error('Unknown index');
    }
    return (await this._client.count({index: index})).count;
  }

  async _wait() {
    return new Promise( (resolve, reject) => {
      setTimeout(() => {
        resolve(this._asyncCount === 0);
      }, 100);
    });
  }

  async wait(timeout: number = 10000) {
    return new Promise( async (resolve, reject) => {
      for (let i = 0; i < timeout; i += 100) {
        let res = await this._wait();
        if (res) {
          return resolve();
        }
      }
      reject();
    });
  }

  setRefreshMode(mode: string) : void {
    this._refreshMode = mode;
  }

  async __clean() {
    for (let i in this._params.indexes) {
      let index = this._params.indexes[i];
      index.name = i;
      let store = index._store = <Store<CoreModel>> this.getService(index.store);
      if (!store) {
        continue;
      }
      this._asyncCount++;
      await this._client.deleteByQuery({
        index: index.name,
        refresh: this._refreshMode,
        q: '*'
      });
      this._asyncCount--;
    }
  }

  static getModda() {
    return {
      "uuid": "Webda/ElasticSearchService",
      "label": "ElasticSearchService",
      "description": "Index a Store allowing you to query it through ES",
      "webcomponents": [],
      "logo": "images/icons/.png",
      "documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
      "configuration": {
        "default": {
          "table": "table-name",
        },
        "widget": {
          "tag": "myservice-configurator",
          "url": "elements/services/webda-dynamodb-configurator.html"
        },
        "schema": {
          type: "object",
          properties: {
            "someprop": {
              type: "string"
            }
          },
          required: ["someprop"]
        }
      }
    }
  }
}

export { ElasticSearchService };