import fs from "fs";
import { globSync } from "glob";
import jp from "jsonpath";

if (process.argv.length < 5) {
  console.log(
    "Usage: \nnode update_all.js filename jsonquery value\nnode update_all.js filename jsonquery value apply"
  );
  console.log(`\tExample: node update_all.js package.json '$.engines.node' ">=18.0.0" apply\n`);
  process.exit(1);
}
let pretend = process.argv[5] !== "apply";

function loadFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file).toString());
  } catch (err) {
    console.log("Cannot parse", file);
    throw err;
  }
}

function saveFile(file, data) {
  if (pretend) {
    console.log(file);
    console.log(JSON.stringify(data, undefined, 2));
    return;
  }
  fs.writeFileSync(file, JSON.stringify(data, undefined, 2));
}

let workspaces = loadFile("./package.json").workspaces;

let filename = process.argv[2]; //"tsconfig.json";
let query = process.argv[3]; //"$.compilerOptions.target";
let value = process.argv[4]; //"es2020";node update_all.js filename jsonquery value

// Try to deduct
if (value === "true") {
  value = true;
} else if (value === "false") {
  value = false;
} else if (value.match(/^\d+$/) !== null) {
  value = parseInt(value);
} else if (value.startsWith("{") || value.startsWith("[")) {
  value = JSON.parse(value);
} else if (value === "DELETE") {
  value = undefined;
}

// For each workspaces
for (let workspace of workspaces) {
  if (!workspace.endsWith("/")) {
    workspace += "/";
  }
  let files = globSync(workspace + filename);
  console.log(files);
  for (let file of files) {
    let content = loadFile(file);
    jp.value(content, query, value);
    saveFile(file, content);
  }
}
