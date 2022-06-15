#!/usr/bin/env node
import fs from "fs";
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

/**
 * Include Webda library
 *
 * Resolution order is:
 *  - local library
 *  - local folder
 *  - embedded library
 */
if (fs.existsSync("node_modules/@webda/core")) {
  // Local module of webda exists use it
  versions["@webda/core"].path = process.cwd() + "/node_modules/@webda/core";
  versions["@webda/core"].version = getVersion(versions["@webda/core"].path);
  versions["@webda/core"].type = "local";
} else if (fs.existsSync("core.js") && fs.existsSync("services/executor.js")) {
  versions["@webda/core"].path = process.cwd();
  versions["@webda/core"].version = "dev";
  versions["@webda/core"].type = "development";
} else {
  let dir = process.cwd() + "/..";
  while (path.resolve(dir) !== "/") {
    if (fs.existsSync(path.join(dir, "node_modules/@webda/core"))) {
      versions["@webda/core"].path = dir + "/node_modules/@webda/core";
      versions["@webda/core"].version = getVersion(versions["@webda/core"].path);
      versions["@webda/core"].type = "local";
      break;
    }
    dir = path.join(dir, "..");
  }
  if (versions["@webda/core"].type !== "local") {
    // Use the webda-shell default webda
    versions["@webda/core"].path = "@webda/core";
    versions["@webda/core"].version = getVersion(versions["@webda/core"].path);
    versions["@webda/core"].type = "embedded";
  }
}
versions["@webda/shell"].path = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".."));
versions["@webda/shell"].version = getVersion(versions["@webda/shell"].path);

/**
 * Commandline parsing
 */
(async () => {
  try {
    const consoleService = (await import(versions["@webda/shell"].path + "/lib/console/webda.js")).default;
    process.exit(await consoleService.handleCommand(process.argv.slice(2), versions));
  } catch (err) {
    console.log("ERROR", err);
    process.exit(1);
  }
})();
