import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { Cron, CronService, Service, ServiceParameters } from "@webda/core";
import * as assert from "assert";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KubernetesCronExporter } from "./cronexporter.service.js";

/**
 * Service exposing a cron
 */
class CronnedService extends Service {
  /**
   * Cron method
   */
  @Cron("0 3 * * *", "Nightly", "arg1", "arg2")
  async nightly() {}
}

@suite
class CronExporterTest extends WebdaApplicationTest {
  @test
  async cronExport() {
    const target = mkdtempSync(join(tmpdir(), "webda-crons-"));
    try {
      this.registerService(new CronnedService("Cronned", new ServiceParameters().load({})));
      const exporter = new KubernetesCronExporter("exporter", new ServiceParameters().load({}));
      // Default template
      assert.strictEqual(await exporter.cronExport(undefined, target, undefined, "webda.io/app:1.0"), 1);
      let files = readdirSync(target);
      assert.strictEqual(files.length, 1);
      assert.match(files[0], /^cronned\.nightly-[0-9a-f]{8}\.yaml$/);
      const content = readFileSync(join(target, files[0])).toString();
      assert.match(content, /kind: CronJob/);
      assert.match(content, /name: cronned-nightly-[0-9a-f]{8}/);
      assert.match(content, /image: webda.io\/app:1.0/);
      assert.match(content, /schedule: 0 3 \* \* \*/);
      // The job runs the declared cron through the CLI `cron run` command
      const id = CronService.getExportId(CronService.loadAnnotations(this.webda.getServices())[0]);
      assert.match(content, new RegExp(`args: \\["cron", "run", "--id", "${id}"\\]`));
      assert.ok(!content.includes("launch") && !content.includes("--noCompile"));
      // Custom template and filename
      rmSync(target, { recursive: true });
      const template = join(tmpdir(), "webda-cron-template.sh");
      writeFileSync(template, `run "\${cron.argsLine}"`);
      assert.strictEqual(await exporter.cronExport(template, target, "${serviceName}.${ext}"), 1);
      files = readdirSync(target);
      assert.deepStrictEqual(files, ["Cronned.sh"]);
      assert.strictEqual(readFileSync(join(target, files[0])).toString(), `run "arg1" "arg2"`);
      rmSync(template);
    } finally {
      rmSync(target, { recursive: true, force: true });
      delete this.webda.getServices()["Cronned"];
    }
  }
}
