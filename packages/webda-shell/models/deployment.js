const CoreModel = require('webda/models/coremodel');

class Deployment extends CoreModel {
  constructor(raw, secure) {
    super(raw, secure);
    if (this.params) {
      this.parameters = this.params;
      delete this.parameters;
    }
    this.parameters = this.parameters || {};
    this.resources = this.resources || {};
    this.services = this.services || {};
    this.units = this.units || [];
    this._type = 'deployment';
    if (this.callback) delete this.callback;
  }
}

module.exports = Deployment;
