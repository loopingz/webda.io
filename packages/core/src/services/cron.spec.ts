import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  Cron,
  CronDefinition,
  CronService,
  Operation,
  Service,
  ServiceParameters,
  registerSchema,
  useApplication,
  useInstanceStorage
} from "../index.js";
import { WebdaApplicationTest } from "../test";

/**
 * Register an operation input schema in the application and the validator
 * @param name - the schema name
 * @param value - the JSON schema
 */
function schema(name: string, value: any) {
  useApplication().getSchemas()[name] = value;
  try {
    registerSchema(name, value);
  } catch {
    // registered by a previous test
  }
}

/** Input schema of a `reconcile(full: boolean)` method */
const FULL_INPUT = { type: "object", properties: { full: { type: "boolean" } }, required: ["full"] };

class MyService extends Service {
  @Operation()
  @Cron("0/15 * * * *", "plop")
  async test() {
    // Empty one
  }

  @Operation()
  @Cron("0/25 * * * *", undefined, { myArg: "myArg" })
  async test2(myArg: string) {
    this.calls.push(myArg);
  }

  calls: string[] = [];
}

/** @Cron below @Operation */
class ReconcileService extends Service {
  calls: boolean[] = [];

  @Operation()
  @Cron("0 3 * * *", "nightly", { full: true })
  async reconcile(full: boolean) {
    this.calls.push(full);
  }
}

/** @Cron above @Operation */
class ReverseService extends Service {
  @Cron("0 3 * * *", "nightly", { full: true })
  @Operation()
  async reconcile(_full: boolean) {
    // Empty one
  }
}

/** @Cron on a method that is not an operation */
class PlainCronService extends Service {
  @Cron("* * * * *")
  async plain() {
    // Empty one
  }
}

/** Cron input not matching the operation input */
class InvalidInputService extends Service {
  @Operation()
  @Cron("* * * * *", "", { full: "x" })
  async reconcile(_full: boolean) {
    // Empty one
  }
}

/** Operation disabled by configuration */
class DisabledService extends Service {
  @Operation()
  @Cron("* * * * *")
  async reconcile() {
    // Empty one
  }

  getOperationId(_id: string): string | undefined {
    return undefined;
  }
}

/**
 * Register and resolve a service, its input schema first so its operations get it
 * @param test - the test
 * @param ServiceClass - the service class
 * @param name - the service name
 * @returns the resolved service
 */
function addService<T extends Service>(
  test: WebdaApplicationTest,
  ServiceClass: new (name: string, params: any) => T,
  name: string
): T {
  schema(`${name}.reconcile.input`, FULL_INPUT);
  return test.registerService(new ServiceClass(name, new ServiceParameters().load({}))).resolve() as T;
}

@suite
class CronServiceTest extends WebdaApplicationTest {
  @test
  annotations() {
    addService(this, MyService, "myService");
    try {
      const def = new CronDefinition("0/15 * * * *", {}, "myService", "test", "plop", "MyService.Test");
      const service = new CronService("cron", {});
      service.schedule("* * * * *", () => {}, "mine");
      assert.deepStrictEqual(service.getCrontab()[1], def);
      // for cov
      assert.deepStrictEqual(service.getCrontab()[1], def);
    } finally {
      delete this.webda.getServices()["myService"];
    }
  }

  @test
  cronRequiresOperation() {
    const plain = addService(this, PlainCronService, "plainCron");
    try {
      assert.throws(
        () => CronService.resolveCrons({ plainCron: plain }),
        /@Cron on PlainCron.plain requires @Operation/
      );
    } finally {
      delete this.webda.getServices()["plainCron"];
    }
  }

  @test
  cronResolvesOperationId() {
    const reconcile = addService(this, ReconcileService, "reconcile");
    const reverse = addService(this, ReverseService, "reverse");
    try {
      const [cron] = CronService.resolveCrons({ reconcile });
      assert.strictEqual(cron.operationId, "Reconcile.Reconcile");
      assert.deepStrictEqual(cron.input, { full: true });
      assert.strictEqual(cron.serviceName, "reconcile");
      assert.strictEqual(cron.method, "reconcile");
      assert.strictEqual(cron.toString(), '0 3 * * *: Reconcile.Reconcile({"full":true}) # nightly');
      // The decorator order does not matter
      const [reversed] = CronService.resolveCrons({ reverse });
      assert.strictEqual(reversed.operationId, "Reverse.Reconcile");
      assert.deepStrictEqual(reversed.input, { full: true });
    } finally {
      delete this.webda.getServices()["reconcile"];
      delete this.webda.getServices()["reverse"];
    }
  }

  @test
  cronInvalidInput() {
    const invalid = addService(this, InvalidInputService, "invalidInput");
    try {
      assert.throws(
        () => CronService.resolveCrons({ invalidInput: invalid }),
        /Invalid cron input for InvalidInput.Reconcile: \/full must be boolean/
      );
    } finally {
      delete this.webda.getServices()["invalidInput"];
    }
  }

  @test
  cronNotPlainInput() {
    assert.throws(() => Cron("* * * * *", "", <any>"myArg"), /@Cron input must be a plain object/);
    assert.throws(() => Cron("* * * * *", "", <any>[1]), /@Cron input must be a plain object/);
  }

  @test
  cronDisabledOperationSkipped() {
    const disabled = addService(this, DisabledService, "disabled");
    try {
      assert.deepStrictEqual(CronService.resolveCrons({ disabled }), []);
    } finally {
      delete this.webda.getServices()["disabled"];
    }
  }

  @test
  registerCron() {
    const reconcile = addService(this, ReconcileService, "reconcile");
    try {
      const registered = CronService.register("Reconcile.Reconcile", { cron: "* * * * *", input: { full: false } });
      assert.strictEqual(registered.serviceName, "reconcile");
      assert.strictEqual(registered.method, "reconcile");
      const crons = CronService.resolveCrons({ reconcile });
      assert.strictEqual(crons.length, 2);
      assert.deepStrictEqual(crons[1], registered);
      assert.deepStrictEqual(crons[1].input, { full: false });
      assert.throws(() => CronService.register("Unknown.Op", { cron: "* * * * *" }), /Unknown operation Unknown.Op/);
      assert.throws(
        () => CronService.register("Reconcile.Reconcile", { cron: "* * * * *", input: { full: "x" } }),
        /Invalid cron input for Reconcile.Reconcile/
      );
    } finally {
      useInstanceStorage().crons = [];
      delete this.webda.getServices()["reconcile"];
    }
  }

  @test
  loadAnnotationsAlias() {
    const reconcile = addService(this, ReconcileService, "reconcile");
    try {
      assert.deepStrictEqual(CronService.loadAnnotations({ reconcile }), CronService.resolveCrons({ reconcile }));
    } finally {
      delete this.webda.getServices()["reconcile"];
    }
  }
}

@suite
class CronRunTest extends WebdaApplicationTest {
  @test
  async runCronById() {
    schema("myService.test2.input", { type: "object", properties: { myArg: { type: "string" } } });
    const myService = addService(this, MyService, "myService");
    try {
      const service = new CronService("cron", {});
      const cron = CronService.resolveCrons({ myService }).find(c => c.method === "test2");
      const id = CronService.getExportId(cron);
      assert.match(id, /^[0-9a-f]{8}$/);
      // Runs the annotated operation with its declared input
      await service.runCron(id);
      assert.deepStrictEqual(myService.calls, ["myArg"]);
      // Unknown or missing id fails, so the job exits non-zero
      await assert.rejects(() => service.runCron("deadbeef"), /No cron with id 'deadbeef'/);
      await assert.rejects(() => service.runCron(undefined), /A cron id is required/);
    } finally {
      delete this.webda.getServices()["myService"];
    }
  }
}

@suite
class CronDefinitionTest {
  @test
  testString() {
    assert.strictEqual(new CronDefinition("* * * * *").toString(), "* * * * *: ({})");
    assert.strictEqual(CronService.getCronId(new CronDefinition("* * * * *"), "plop"), "7ba9eb12");
    assert.strictEqual(
      new CronDefinition("* * * * *", { a: 1 }, "plop", "method", "desc", "Plop.Method").toString(),
      '* * * * *: Plop.Method({"a":1}) # desc'
    );
  }

  @test
  exportIdStable() {
    const a = new CronDefinition("* * * * *", { full: true }, "plop", "method", "desc", "Plop.Method");
    const b = new CronDefinition("* * * * *", { full: true }, "plop", "renamed", "desc", "Plop.Method");
    assert.strictEqual(CronService.getExportId(a), CronService.getExportId(b));
    const c = new CronDefinition("* * * * *", { full: false }, "plop", "method", "desc", "Plop.Method");
    assert.notStrictEqual(CronService.getExportId(a), CronService.getExportId(c));
  }
}
