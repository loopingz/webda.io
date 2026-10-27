import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { openSession } from "./context.ts";
import { generateWebdaModule } from "./module.ts";
import { runTwoPass } from "./twopass.ts";

const packages = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("polymorphic accessor generation", () => {
  it("emits executable, type-correct accessors that initialize, constrain and serialize references", async () => {
    const dir = mkdtempSync(join(tmpdir(), "webda-polymorphic-"));
    try {
      mkdirSync(join(dir, "node_modules", "@webda"), { recursive: true });
      symlinkSync(join(packages, "models"), join(dir, "node_modules", "@webda", "models"));
      writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            target: "esnext",
            module: "nodenext",
            strict: true,
            skipLibCheck: true,
            strictPropertyInitialization: false,
            outDir: "lib"
          },
          include: ["*.ts"]
        })
      );
      writeFileSync(
        join(dir, "report.model.ts"),
        `
        import { ModelLinksAny, UuidModel } from "@webda/models";
        export class Task extends UuidModel {}
        export class PullRequest extends UuidModel {}
        export class Report extends UuidModel {
          links: ModelLinksAny<{rel: string}>;
          restricted: ModelLinksAny<{rel: string}, Task | PullRequest>;
          initialized: ModelLinksAny = new ModelLinksAny();
        }
        export function assign(report: Report) {
          report.links = [{model: "App/Task", key: "one", rel: "implements"}];
        }
      `
      );
      const result = runTwoPass({ configFile: join(dir, "tsconfig.json"), rootDir: dir, emit: true });
      expect(result.diagnostics).toEqual([]);
      const session = openSession(join(dir, "tsconfig.json"), dir);
      try {
        const metadata = generateWebdaModule(session.ctx, {
          appPath: dir,
          rootDir: dir,
          outDir: join(dir, "lib"),
          namespace: "App"
        });
        expect(metadata.errors).toEqual([]);
        const model = metadata.module.models["App/Report"];
        expect(model.Relations.polymorphicLinks).toEqual([
          { attribute: "links" },
          { attribute: "restricted", models: ["App/PullRequest", "App/Task"] },
          { attribute: "initialized" }
        ]);
        for (const schema of Object.values(model.Schemas)) {
          const field: any = schema.properties!.restricted;
          expect(field.items.properties, JSON.stringify(schema)).toBeDefined();
          expect(field.items.properties.model.enum).toEqual(["App/PullRequest", "App/Task"]);
          expect(field.items.properties.rel.type).toBe("string");
        }
      } finally {
        session.dispose();
      }
      expect(result.injected.get(join(dir, "report.model.ts"))).toMatch(
        /new ModelLinksAny\(\[(Task, PullRequest|PullRequest, Task)\]\)/
      );
      for (const [path, content] of result.emitted) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content);
      }
      const { Report, Task, PullRequest, assign } = await import(
        /* @vite-ignore */ pathToFileURL(join(dir, "lib", "report.model.js")).href
      );
      for (const clazz of [Report, Task, PullRequest])
        clazz.Metadata = { Identifier: `App/${clazz.name}`, PrimaryKey: ["uuid"], Subclasses: [] };
      const report = new Report();
      // No manual initializer: the container must stay attached to the model.
      report.links.add({ model: "App/Task", key: "one", rel: "implements" });
      expect(report.links.length).toBe(1);
      report.initialized.add({ model: "App/Task", key: "default" });
      expect(report.initialized.length).toBe(1);
      expect(JSON.parse(JSON.stringify(report)).links).toEqual([{ model: "App/Task", key: "one", rel: "implements" }]);
      assign(report);
      expect(report.links[0].rel).toBe("implements");
      expect(() => {
        report.restricted = [{ model: "App/Report", key: "one", rel: "bad" }];
      }).toThrow(/not an allowed/);
      // Assigning another container must not bypass the receiving property's constraints.
      expect(() => {
        report.restricted = report.links;
      }).not.toThrow();
      report.links.add({ model: "App/Report", key: "one", rel: "bad" });
      expect(() => {
        report.restricted = report.links;
      }).toThrow(/not an allowed/);
      expect(report.restricted.length).toBe(1);
      const { MemoryRepository, registerRepository } = await import(
        /* @vite-ignore */ pathToFileURL(join(packages, "models", "lib", "index.js")).href
      );
      Report.registerSerializer();
      registerRepository(Report, new MemoryRepository(Report, ["uuid"]));
      report.uuid = "report";
      report.links.add({ model: "App/Task", key: { tenant: "acme", id: 42 }, rel: "composite" });
      await report.save();
      const reloaded = await Report.ref("report").get();
      expect(reloaded.links.toJSON()).toEqual(report.links.toJSON());
      expect(reloaded.links[2].key).toEqual({ tenant: "acme", id: 42 });
      reloaded.links[0].rel = "updated";
      await reloaded.save();
      expect((await Report.ref("report").get()).links[0].rel).toBe("updated");
      expect(reloaded.toDTO().links[0]).toEqual({ model: "App/Task", key: "one", rel: "updated" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
