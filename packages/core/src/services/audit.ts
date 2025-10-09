import { Inject, Service } from "../services/service.js";
import { Store } from "../stores/store.js";

/**
 * Define audit entry
 */
class AuditService extends Service {
  @Inject("auditStore", "auditStore")
  auditStore: Store;
  test: string;
}
