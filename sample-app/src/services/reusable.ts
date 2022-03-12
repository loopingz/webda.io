import { ModdaDefinition, Service, ServiceParameters, Modda } from "@webda/core";

class CustomReusableServiceParameters extends ServiceParameters {
  mandatoryField: string;
}

@Modda
export default class CustomReusableService<
  T extends CustomReusableServiceParameters = CustomReusableServiceParameters
> extends Service<T> {
  static getModda(): ModdaDefinition {
    return {
      uuid: "WebdaDemo/CustomReusableService",
      label: "Fake service with modda for demo purpose",
      description: "",
      logo: ""
    };
  }
}
