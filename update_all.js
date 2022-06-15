const fs = require("fs");
const glob = require("glob");
const jp = require("jsonpath");

if (process.argv.length < 5) {
  console.log(
    "Usage: \nnode update_all.js filename jsonquery value\nnode update_all.js filename jsonquery value apply"
  );
  process.exit(1);
}
let pretend = process.argv[5] !== "apply";

function loadFile(file) {
  return JSON.parse(fs.readFileSync(file).toString());
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

console.log(process.argv);
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
}

// For each workspaces
for (let workspace of workspaces) {
  if (!workspace.endsWith("/")) {
    workspace += "/";
  }
  let files = glob.GlobSync(workspace + filename).found;
  console.log(files);
  for (let file of files) {
    let content = loadFile(file);
    jp.value(content, query, value);
    saveFile(file, content);
  }
}
