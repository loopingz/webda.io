import { CoreModel } from "@webda/core";

export default class Contact extends CoreModel {
  constructor() {
    super();
  }

  static getModda() {
    return {
      uuid: "WebdaDemo/Contact",
      category: "models",
      label: "Fake service with modda for demo purpose",
      description: "",
      logo: "",
      configuration: {}
    };
  }
}
