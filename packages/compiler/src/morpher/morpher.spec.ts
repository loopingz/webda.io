import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { suite, test, expect } from "vitest";
import { WebdaMorpher } from "./morpher";
import { join, resolve } from "node:path";

suite(import.meta.dirname, () => {
  const morpher = new WebdaMorpher();
  const dir = resolve(import.meta.dirname + "/../../test/4.0");
  readdirSync(dir)
    .filter(f => !f.includes(".output."))
    .forEach(file => {
      test(file, async () => {
        const output = morpher.update(join(dir, file));
        const outputName = join(dir, file.replace(/\.((m|c)?(j|t)s)/, ".output.$1"));
        if (existsSync(outputName) && !process.env.UPDATE_SNAPSHOT) {
          expect(output).toEqual(readFileSync(outputName, "utf-8"));
        } else {
          writeFileSync(outputName, output);
        }
      });
    });
});
