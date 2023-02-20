import { FileUtils } from "@webda/core";
import glob from "glob";
import jsonpath from "jsonpath";

const pathArg = process.argv[2];
const value = process.argv[3];
const all = process.argv[4] === "all";

glob("packages/*/package.json", (err, files) => {
  files.push("sample-app/package.json");
  files.forEach(file => {
    console.log(file);
    let data = FileUtils.load(file);
    let info = jsonpath.value(data, pathArg);
    if (info || all) {
      jsonpath.value(data, pathArg, value);
      FileUtils.save(data, file);
    }
  });
});
