import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { expect, suite, test } from "vitest";
import * as jscodeshift from "jscodeshift";

suite(import.meta.dirname, () => {
  readdirSync(import.meta.dirname + "/__tests__")
    .filter(f => !f.includes(".output."))
    .forEach(file => {
      test(file, async () => {
        const transform = (await import("../webda-3.x-4.0.mjs")).default;
        const input = {
          source: readFileSync(import.meta.dirname + "/__tests__/" + file, "utf-8"),
          path: import.meta.dirname + "/__tests__/" + file
        };
        const output = transform(
          input,
          { jscodeshift: jscodeshift.default, j: jscodeshift.default, stats: () => {} },
          {}
        );
        const outputName = import.meta.dirname + "/__tests__/" + file.replace(/\.((m|c)?(j|t)s)/, ".output.$1");
        if (existsSync(outputName) && !process.env.UPDATE_SNAPSHOT) {
          expect(output).toEqual(readFileSync(outputName, "utf-8"));
        } else {
          writeFileSync(outputName, output);
        }

        console.log("Test", outputName);
      });
    });
});
