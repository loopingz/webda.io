import { Service, useCoreEvents } from "@webda/core";

class CasbinService extends Service {
    resolve() {
        super.resolve();
        useCoreEvents("Webda.BeforeOperation", async (evt) => {
            // TODO Check permission with casbin
        });
        return this;
    }
}