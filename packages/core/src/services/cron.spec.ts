import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import {
  Cluster,
  ClusterService,
  ClusterServiceParameters,
  Cron,
  CronDefinition,
  CronService,
  Operation,
  Service,
  ServiceParameters,
  StoreClusterService,
  StoreClusterServiceParameters,
  registerOperationAuthorizer,
  registerSchema,
  unregisterOperationAuthorizer,
  useApplication,
  useContext,
  useCoreEvents,
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

/** Operations recording their calls, one of them failing */
class TickService extends Service {
  calls: { full: boolean; user: string }[] = [];
  failures = 0;

  @Operation()
  @Cron("1 * * * *", "tick", { full: true })
  async reconcile(full: boolean) {
    this.calls.push({ full, user: useContext().getCurrentUserId() });
  }

  @Operation()
  @Cron("2 * * * *", "failing")
  async fail() {
    this.failures++;
    throw new Error("intentional failure");
  }
}

/**
 * Cluster whose leadership is driven by the test
 */
class FakeCluster extends ClusterService {
  /** Result of the next attempts */
  result = true;

  /** @override */
  protected async acquireOrRenew(): Promise<boolean> {
    return this.result;
  }

  /** @override */
  protected async release(): Promise<void> {
    // Nothing to release
  }
}

/** A node-cron task recorded by {@link LeaderCronService} */
interface RecordedTask {
  expr: string;
  cb: () => any;
  stop: ReturnType<typeof vi.fn>;
}

/**
 * CronService of a replica: its own cluster, node-cron replaced by a recorder
 */
class LeaderCronService extends CronService {
  recorded: RecordedTask[] = [];
  cluster?: Cluster;

  constructor(name: string, cluster?: Cluster) {
    super(name, {});
    this.cluster = cluster;
    this.crontabSchedule = <any>((expr: string, cb: () => any) => {
      const task = { expr, cb, stop: vi.fn() };
      this.recorded.push(task);
      return task;
    });
  }

  /** @override */
  protected getCluster(): Cluster {
    return this.cluster ?? super.getCluster();
  }

  /**
   * @param expr - the cron expression
   * @returns the tasks scheduled for it
   */
  tasksOf(expr: string): RecordedTask[] {
    return this.recorded.filter(t => t.expr === expr);
  }
}

@suite
class CronExecutionTest extends WebdaApplicationTest {
  tick: TickService;
  services: LeaderCronService[] = [];

  async beforeEach() {
    await super.beforeEach();
    this.tick = addService(this, TickService, "tick");
  }

  async afterEach() {
    for (const service of this.services.splice(0)) {
      await service.stop();
    }
    delete this.webda.getServices()["tick"];
    await super.afterEach();
  }

  /**
   * Run a CronService
   * @param cluster - its cluster, the application one by default
   * @returns the running service
   */
  run(cluster?: Cluster): LeaderCronService {
    const service = new LeaderCronService(`cron${this.services.length}`, cluster);
    this.services.push(service);
    service.run().catch(err => {
      if (err !== "Cancelled") throw err;
    });
    return service;
  }

  @test
  async tickCallsOperation() {
    const operations: string[] = [];
    const off = useCoreEvents("Webda.BeforeOperation", ({ operationId }) => {
      operations.push(operationId);
    });
    try {
      const service = this.run();
      await vi.waitFor(() => assert.strictEqual(service.tasksOf("1 * * * *").length, 1));
      await service.tasksOf("1 * * * *")[0].cb();
      assert.deepStrictEqual(operations, ["Tick.Reconcile"]);
      assert.deepStrictEqual(
        this.tick.calls.map(c => c.full),
        [true]
      );
    } finally {
      off();
    }
  }

  @test
  async tickRunsAsSystem() {
    const service = this.run();
    await vi.waitFor(() => assert.strictEqual(service.tasksOf("1 * * * *").length, 1));
    await service.tasksOf("1 * * * *")[0].cb();
    assert.strictEqual(this.tick.calls[0].user, "system");
  }

  @test
  async tickErrorLogged() {
    const service = this.run();
    await vi.waitFor(() => assert.strictEqual(service.tasksOf("2 * * * *").length, 1));
    const [task] = service.tasksOf("2 * * * *");
    await task.cb();
    await task.cb();
    assert.strictEqual(this.tick.failures, 2);
    // execute never rejects
    const cron = CronService.resolveCrons({ tick: this.tick }).find(c => c.method === "fail");
    await CronService.execute(cron);
    assert.strictEqual(this.tick.failures, 3);
  }

  @test
  async nativeCallbacksOnLeaderOnly() {
    const cluster = new FakeCluster(
      "fakeCluster",
      new ClusterServiceParameters().load({ leaseDuration: 3000, renewInterval: 1000, instanceId: "me" })
    );
    cluster.result = false;
    await cluster.init();
    try {
      const service = new LeaderCronService("native", cluster);
      this.services.push(service);
      service.schedule("3 * * * *", () => {}, "before run");
      service.run(false).catch(() => {});
      service.schedule("4 * * * *", () => {}, "after run");
      await new Promise(resolve => setImmediate(resolve));
      assert.deepStrictEqual(service.recorded, []);
      cluster.result = true;
      await (<any>cluster).attempt();
      await vi.waitFor(() =>
        assert.deepStrictEqual(
          service.recorded.map(t => t.expr),
          ["3 * * * *", "4 * * * *"]
        )
      );
      // Scheduled while leading: started at once
      service.schedule("5 * * * *", () => {});
      assert.strictEqual(service.tasksOf("5 * * * *").length, 1);
    } finally {
      await cluster.stop();
    }
  }

  @test
  async onlyLeaderSchedules() {
    vi.useFakeTimers();
    const clusters = [0, 1].map(
      i =>
        new StoreClusterService(
          `cluster${i}`,
          new StoreClusterServiceParameters().load({
            leaseDuration: 3000,
            renewInterval: 1000,
            instanceId: `replica${i}`,
            leaseName: "cron-test"
          })
        )
    );
    try {
      await clusters[0].init();
      await clusters[1].init();
      assert.strictEqual(clusters[0].isLeader(), true);
      assert.strictEqual(clusters[1].isLeader(), false);
      const replicas = clusters.map(c => this.run(c));
      await vi.waitFor(() => assert.strictEqual(replicas[0].tasksOf("1 * * * *").length, 1));
      assert.deepStrictEqual(replicas[1].recorded, []);
      // A tick runs the operation once across the replicas
      await Promise.all(replicas.flatMap(r => r.tasksOf("1 * * * *")).map(t => t.cb()));
      assert.strictEqual(this.tick.calls.length, 1);
      // The leader stops: its tasks stop, the other replica takes over
      await clusters[0].stop();
      assert.ok(replicas[0].recorded.every(t => t.stop.mock.calls.length === 1));
      await vi.advanceTimersByTimeAsync(1000);
      await vi.waitFor(() => assert.strictEqual(replicas[1].tasksOf("1 * * * *").length, 1));
    } finally {
      for (const cluster of clusters) {
        await cluster.stop();
      }
      vi.useRealTimers();
    }
  }

  @test
  async leadershipLossStopsTasks() {
    vi.useFakeTimers();
    const cluster = new FakeCluster(
      "fakeCluster",
      new ClusterServiceParameters().load({ leaseDuration: 3000, renewInterval: 1000, instanceId: "me" })
    );
    try {
      await cluster.init();
      const service = this.run(cluster);
      await vi.waitFor(() => assert.strictEqual(service.tasksOf("1 * * * *").length, 1));
      const tasks = [...service.recorded];
      cluster.result = false;
      await vi.advanceTimersByTimeAsync(1000);
      assert.strictEqual(cluster.isLeader(), false);
      assert.ok(tasks.length > 0);
      assert.ok(tasks.every(t => t.stop.mock.calls.length === 1));
      // Leading again schedules new tasks
      cluster.result = true;
      await vi.advanceTimersByTimeAsync(1000);
      await vi.waitFor(() => assert.strictEqual(service.tasksOf("1 * * * *").length, 2));
      // Stopping the service stops them and unregisters
      await service.stop();
      assert.ok(service.recorded.every(t => t.stop.mock.calls.length === 1));
      cluster.result = false;
      await vi.advanceTimersByTimeAsync(1000);
      cluster.result = true;
      await vi.advanceTimersByTimeAsync(1000);
      assert.strictEqual(service.tasksOf("1 * * * *").length, 2);
    } finally {
      await cluster.stop();
      vi.useRealTimers();
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
class CronCommandTest extends WebdaApplicationTest {
  @test
  async runCronCommandUsesOperation() {
    const tick = addService(this, TickService, "tick");
    const authorized: { operationId: string; user: string; input: any }[] = [];
    const authorizer = async (context, operationId, _operation, { input }) => {
      authorized.push({ operationId, user: context.getCurrentUserId(), input });
      return true;
    };
    registerOperationAuthorizer(authorizer);
    try {
      const service = new CronService("cron", {});
      const crons = CronService.resolveCrons({ tick });
      await service.runCron(CronService.getExportId(crons.find(c => c.method === "reconcile")));
      assert.deepStrictEqual(authorized, [{ operationId: "Tick.Reconcile", user: "system", input: { full: true } }]);
      assert.deepStrictEqual(tick.calls, [{ full: true, user: "system" }]);
      // A failed run fails the command, so the job exits non-zero
      await assert.rejects(
        () => service.runCron(CronService.getExportId(crons.find(c => c.method === "fail"))),
        /intentional failure/
      );
      assert.strictEqual(tick.failures, 1);
    } finally {
      unregisterOperationAuthorizer(authorizer);
      delete this.webda.getServices()["tick"];
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
