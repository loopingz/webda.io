import { CoreModel, Inject, Service, Store } from "@webda/core";

class AuditService extends Service {
  @Inject("auditStore", "auditStore")
  auditStore: Store<CoreModel>;
}
