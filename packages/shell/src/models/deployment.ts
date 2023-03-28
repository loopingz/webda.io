import { CoreModel } from "@webda/core";

/**
 * @WebdaModel
 */
export default class Deployment extends CoreModel {
  parameters: any = {};
  resources: any = {};
  services: any = {};
  units: any[] = [];
  _type: string = "deployment";
  callback: any;

  async canAct(_ctx: any, _action: string): Promise<string | true> {
    // Allow everything
    return true;
  }
}

export { Deployment };
