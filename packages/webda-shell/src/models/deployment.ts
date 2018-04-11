import { CoreModel } from 'webda';

export default class Deployment extends CoreModel {
  params: any;
  parameters: any;
  resources: any;
  services: any;
  units: any[];
  _type: string;
  callback: any;

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

  async canAct(ctx: any, action: string) {
    console.log(action);
    return this;
  }
}

export { Deployment };