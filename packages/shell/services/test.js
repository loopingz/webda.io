"use strict";
/**
 * Created by loopingz on 20/04/2017.
 */
const Service = require("webda").Service;

class TestService extends Service {

  worker() {
    console.log('worker called', this._params);
  }

  bouzouf(arg1, arg2) {
    console.log('bouzouf called', arg1, arg2, this._params);
  }
}

module.exports = TestService;
