#!/usr/bin/env node
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
/**
 * Get Version of a package (version attribute of package.json)
 *
 * @param packageName to retrieve version from
 */
function getVersion(packageName) {
    return JSON.parse(fs.readFileSync(packageName + "/package.json").toString()).version;
}
let versions = {
    "@webda/core": {
        path: "",
        version: "",
        type: ""
    },
    "@webda/shell": {
        path: "",
        version: "",
        type: ""
    }
};
// Rely solely on the Node resolver
const require = createRequire(import.meta.url);
versions["@webda/core"].path = path.dirname(require.resolve("@webda/core/package.json"));
versions["@webda/core"].version = getVersion(versions["@webda/core"].path);
versions["@webda/core"].type = "resolved";
versions["@webda/shell"].path = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".."));
versions["@webda/shell"].version = getVersion(versions["@webda/shell"].path);
/**
 * Commandline parsing
 */
(async () => {
    try {
        const consoleService = (await import(versions["@webda/shell"].path + "/lib/console/webda.js")).default;
        process.exit(await consoleService.handleCommand(process.argv.slice(2), versions));
    }
    catch (err) {
        console.log("ERROR", err);
        process.exit(1);
    }
})();
//# sourceMappingURL=webda.js.map