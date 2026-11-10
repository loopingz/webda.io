import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { suite, test, expect } from "vitest";
import { WebdaMorpher } from "./morpher.js";
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

  test("check() in pretend and write modes and namespace import merge", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "morpher-check-"));
    try {
      mkdirSync(join(tmp, "src"), { recursive: true });
      writeFileSync(join(tmp, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
      const srcFile = join(tmp, "src", "sample.ts");
      writeFileSync(
        srcFile,
        `import "@webda/ql";\nimport { WebdaQL, FileStore } from "@webda/core";\nexport const x = [WebdaQL, FileStore];\n`
      );

      // 1. Pretend mode does not modify file on disk
      const pretendMorpher = new WebdaMorpher({
        project: { tsConfigFilePath: join(tmp, "tsconfig.json") },
        pretend: true
      });
      await pretendMorpher.check();
      expect(readFileSync(srcFile, "utf-8")).toContain('from "@webda/core"');

      // 2. Write mode saves modified file and handles save errors gracefully
      const writeMorpher = new WebdaMorpher({
        project: { tsConfigFilePath: join(tmp, "tsconfig.json") },
        pretend: false
      });
      await writeMorpher.check();
      const updated = readFileSync(srcFile, "utf-8");
      expect(updated).toContain("* as WebdaQL");
      expect(updated).toContain('from "@webda/fs"');

      // 3. Save error branch
      writeFileSync(srcFile, `import { FileStore } from "@webda/core";\nexport const y = FileStore;\n`);
      const errMorpher = new WebdaMorpher({
        project: { tsConfigFilePath: join(tmp, "tsconfig.json") },
        pretend: false
      });
      const sf = errMorpher.project.getSourceFiles()[0];
      sf.save = async () => {
        throw new Error("disk full");
      };
      await errMorpher.check();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
