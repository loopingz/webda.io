import { Controller } from "redux-lz-controller";
// Temporary import of services object
import { services } from "../servicesSample";

class ConfigController extends Controller {
    constructor() {
        super("config", { configuration: {} });
    }
    init() {
        super.init();
        this.load();
    }
    async load() {
        this.asyncAction("LOAD_CONFIG", async () => {
            return { configuration: services }
        })
    }

}

export default ConfigController;