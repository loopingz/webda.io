const fs = require("fs");
const glob = require("glob");
const prettier = require("prettier");

glob(
  "src/**/*.[t|j]s",
  {
    absolute: true
  },
  (er, files) => {
    files.forEach(file => {
      const data = fs.readFileSync(file, "utf8");
      const nextData = prettier.format(data, { filepath: file });
      fs.writeFileSync(file, nextData, "utf8");
    });
  }
);
