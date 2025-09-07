import { Inject, Service } from "../services/service";
import { Store } from "../stores/store";

/**
 * Define audit entry
 */
class AuditService extends Service {
  @Inject("auditStore", "auditStore")
  auditStore: Store;
  test: string;
}
