import { Controller } from "redux-lz-controller";
// Temporary import of services object
import { config } from "../servicesSample";

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
            // temporary mocking async behavior
            await new Promise(resolve => setTimeout(resolve, 3000));
            return { configuration: config }
        })
    }

}

export default ConfigController;