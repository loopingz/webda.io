import { Bean, Operation, Service, ServiceName, ServiceParameters, useService } from "@webda/core";
import { PrimaryKey, PrimaryKeyType } from "@webda/models";
import { Contact } from "../models/Contact";

export class ExporterParameters extends ServiceParameters {
  googleToken: string;
}

@Bean
export class ExporterService extends Service<ExporterParameters> {
  test: ServiceName;
  @Operation()
  async exportContacts(target: "google" | "csv", subset: (PrimaryKeyType<Contact> | string)[]): Promise<number> {
    this.test = "ExporterService";
    const me = useService("ExporterService");

    return 0;
  }
}
