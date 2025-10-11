import { useCoreEvents } from "../events/events.js";
import { Inject, Service } from "../services/service.js";
import { Store } from "../stores/store.js";

/**
 * Define audit entry
 */
class AuditService extends Service {
  @Inject("auditStore", "auditStore")
  auditStore: Store;
  test: string;

  resolve() {
    super.resolve();
    useCoreEvents("Webda.OperationFailure", async (evt) => {
      await this.addAuditEntry(evt.context, evt.error);
    });
    useCoreEvents("Webda.OperationSuccess", async (evt) => {
      await this.addAuditEntry(evt.context);
    });
    return this;
  }

  async addAuditEntry(ctx, err?: Error) {
      if (!this.auditStore) {
        return;    
    }
  }

}
