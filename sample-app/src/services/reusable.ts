import { ModdaDefinition, Service } from "@webda/core";

export default class CustomReusableService extends Service {
  static getModda(): ModdaDefinition {
    return {
      uuid: "WebdaDemo/CustomReusableService",
      label: "Fake service with modda for demo purpose",
      description: "",
      logo: "",
      configuration: {}
    };
  }
}
