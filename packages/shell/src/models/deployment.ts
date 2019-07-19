import { CoreModel } from "webda";

export default class Deployment extends CoreModel {
  parameters: any = {};
  resources: any = {};
  services: any = {};
  units: any[] = [];
  _type: string = "deployment";
  callback: any;

  async canAct(ctx: any, action: string) {
    return this;
  }
}

export { Deployment };
