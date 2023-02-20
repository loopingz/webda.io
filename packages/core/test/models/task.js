import { OwnerModel } from "@webda/core";

/**
 * @class
 */
export class Task extends OwnerModel {
  static getActions() {
    return {
      actionable: {
        methods: ["GET"]
      },
      impossible: {}
    };
  }

  actionable() {}

  impossible() {}

  async canAct(ctx, action) {
    if ("actionable" === action) {
      return this;
    }
    return super.canAct(ctx, action);
  }

  _onSave() {
    this._autoListener = 1;
  }

  _onSaved() {
    this._autoListener = 2;
  }

  toJSON() {
    // Context should be available to the toJSON
    if (this.getContext() !== undefined) {
      this._gotContext = true;
    }
    return super.toJSON();
  }
}
