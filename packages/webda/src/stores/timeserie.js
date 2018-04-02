"use strict";

const Executor = require("../services/executor");

class Reducer {
  constructor(params) {

  }

  reduce(params) {

  }
}

/**
 * This class define Store with a hot and cold storage
 * Store data on a time basis with different type of mapping
 * The hot storage is another store to save data to
 * The cold storage is used to store old event
 */
class TimeSeriesStore extends Executor {

  /**
   * Handle th Store extension
   */
  init() {
    this._hotStore = this.getService(this._params.hotStore);
    this._coldStore = this.getService(this._params.coldStore);
    this._reducers = [];
    for (let i in this._params.reducers) {
      if (!this._params.reducers[i].key) {
        this._params.reducers[i].key = i;
      }
      this._reducers.push(new Reducer(this._params.reducers[i]));
    }
    if (this._hotStore || this._coldStore || this._reducers.length) {
      throw Error('TimeSeriesStore requires a hotStore and coldStore and at least one reducer');
    }
  }

  push(event) {
    // Push into hot store
    event.time = this._getDate();
    return this._hotStore.save(event);
  }

  _getDate() {
    return new Date();
  }

  get(id) {

  }

  getRange(from, to, id) {

  }

  reduce() {
    // Get data for each uuid to append or create on the cold store
    return this._hotStore.getAll().then((items) => {
      var maps = {};
      for (let i in items) {
        for (let r in this._reducers) {
          let key = this._reducers[r].reduce(items[i]);
          if (!maps[key]) {
            maps[key] = [];
          }
          maps[key].push(items);
        }
        //items[i].time;
      }
      return maps;
    }).then(() => {
      // Store the file inside the cold store now
      //this._coldStore
      // Once READ ACK -> Delete item
    });
  }
}

module.exports = TimeSeriesStore;
