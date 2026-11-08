import { suite, test } from "@webda/test";
import * as assert from "assert";
import { useRepository } from "@webda/models";
import { WebdaApplicationTest } from "../test/application.js";
import { useApplication } from "../application/hooks.js";
import { useRegistry } from "../models/registry.model.js";
import { User } from "../models/user.model.js";
import { Ident } from "../models/ident.model.js";
import { MemoryStore } from "./memory.service.js";
import { MigrationAlreadyRunning } from "./migration.js";
import { MigrationStore } from "./migrationstore.service.js";
import { Store } from "./store.js";
import { ClusterService } from "../services/cluster.service.js";

class MockClusterService extends ClusterService {
  leader: boolean = false;
  private callbacks: Array<{ fn: () => void; deregisteredFn?: () => void }> = [];

  isLeader(): boolean {
    return this.leader;
  }

  whenLeader(fn: () => void, deregisteredFn?: () => void): () => void {
    const entry = { fn, deregisteredFn };
    this.callbacks.push(entry);
    if (this.leader) {
      fn();
    }
    return () => {
      const idx = this.callbacks.indexOf(entry);
      if (idx >= 0) {
        this.callbacks.splice(idx, 1);
      }
    };
  }

  setLeader(leader: boolean): void {
    if (this.leader === leader) {
      return;
    }
    this.leader = leader;
    for (const cb of [...this.callbacks]) {
      if (leader) {
        cb.fn();
      } else {
        cb.deregisteredFn?.();
      }
    }
  }
}

@suite
class MigrationStoreTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        Registry: {
          type: "Webda/MemoryStore",
          models: ["Webda/RegistryEntry"]
        }
      }
    };
  }

  async createStores(
    options: {
      autoStart?: boolean;
      batchSize?: number;
      verify?: boolean;
      statusRefreshInterval?: number;
      models?: string[];
      explicitModels?: boolean;
    } = {}
  ): Promise<{
    source: MemoryStore;
    target: MemoryStore;
    migration: MigrationStore;
  }> {
    const models = options.models ?? ["Webda/User", "Webda/Ident"];
    if (await useRegistry().exists("storeMigration.MigratingUsers.transfer")) {
      await useRegistry().delete("storeMigration.MigratingUsers.transfer");
    }
    const source = new MemoryStore("SourceUsers", {
      type: "Webda/MemoryStore",
      models,
      typeCheck: { enabled: false }
    } as any);
    this.registerService(source, "SourceUsers");
    source.resolve();
    await source.init();

    const target = new MemoryStore("TargetUsers", {
      type: "Webda/MemoryStore",
      models,
      typeCheck: { enabled: false }
    } as any);
    this.registerService(target, "TargetUsers");
    target.resolve();
    await target.init();

    const migration = new MigrationStore("MigratingUsers", {
      type: "Webda/MigrationStore",
      source: "SourceUsers",
      target: "TargetUsers",
      autoStart: options.autoStart ?? false,
      batchSize: options.batchSize ?? 2,
      verify: options.verify ?? true,
      statusRefreshInterval: options.statusRefreshInterval ?? 5000,
      ...(options.explicitModels ? { models } : {})
    } as any);
    this.registerService(migration, "MigratingUsers");
    migration.resolve();
    await migration.init();

    return { source, target, migration };
  }

  @test
  async claimsModelsFromSourceAndTargetWithoutWipingTheirHierarchy() {
    const { source, target, migration } = await this.createStores({ autoStart: false });

    // Underlying stores keep their model hierarchy intact
    assert.strictEqual(source.handleModel(User), 0);
    assert.strictEqual(target.handleModel(User), 0);
    assert.strictEqual(migration.handleModel(User), 0);
    assert.strictEqual(migration.handleModel(Ident), 0);

    // Store.claimingStore routes User and Ident to MigrationStore
    assert.strictEqual(Store.claimingStore(User), migration);
    assert.strictEqual(Store.claimingStore(Ident), migration);
    assert.strictEqual((useRepository(User) as any)._store, migration);
  }

  @test
  async validatesSourceAndTargetConfiguration() {
    const invalidSource = new MigrationStore("BadSource", {
      source: "NonExistentStore",
      target: "Registry"
    } as any);
    this.registerService(invalidSource, "BadSource");
    assert.throws(() => invalidSource.resolve(), /source 'NonExistentStore' is not a valid Store/);

    const invalidTarget = new MigrationStore("BadTarget", {
      source: "Registry",
      target: "NonExistentStore"
    } as any);
    this.registerService(invalidTarget, "BadTarget");
    assert.throws(() => invalidTarget.resolve(), /target 'NonExistentStore' is not a valid Store/);

    const sameStore = new MigrationStore("SameStore", {
      source: "Registry",
      target: "Registry"
    } as any);
    this.registerService(sameStore, "SameStore");
    assert.throws(() => sameStore.resolve(), /source and target must be distinct stores/);

    const { migration } = await this.createStores({
      autoStart: false,
      models: ["Webda/User"],
      explicitModels: true
    });
    assert.deepStrictEqual(migration.getParameters().models, ["Webda/User"]);
  }

  @test
  async dualWritesAndCopyOnWriteWhileMigratingThenSwitchesReadsToTarget() {
    const { source, target, migration } = await this.createStores({ autoStart: false });
    const sourceUserRepo = migration.getSourceRepository(User);
    const targetUserRepo = migration.getTargetRepository(User);
    const repo = useRepository(User);

    // Seed pre-existing users in source only
    await sourceUserRepo.create({ uuid: "u1", displayName: "Alice", counter: 1, tags: ["a"] } as any);
    await sourceUserRepo.create({ uuid: "u2", displayName: "Bob", counter: 5, tags: ["b"] } as any);
    await sourceUserRepo.create({ uuid: "u3", displayName: "Charlie", counter: 10 } as any);

    // Before migration completes, reads and queries come from source
    assert.strictEqual(migration.isCompleted(), false);
    assert.strictEqual(await targetUserRepo.exists("u1"), false);
    assert.strictEqual(await repo.exists("u1"), true);
    assert.strictEqual((await repo.get("u1")).displayName, "Alice");
    assert.strictEqual((await repo.count()).value, 3);
    assert.strictEqual((await repo.query("displayName = 'Alice'")).results.length, 1);

    const iteratedBefore: string[] = [];
    for await (const u of repo.iterate("")) {
      iteratedBefore.push(u.uuid);
    }
    assert.deepStrictEqual(iteratedBefore.sort(), ["u1", "u2", "u3"]);

    const aggBefore = await repo.aggregate({ metrics: { total: { count: "*" } } });
    assert.strictEqual(aggBefore.rows[0].total, 3);

    // Track Created events to verify EventRepository emits once per operation
    const createdEvents: string[] = [];
    repo.on("Created", evt => {
      createdEvents.push((evt as any).object.uuid);
    });

    // Live create dual-writes to both source and target
    await repo.create({ uuid: "u4", displayName: "Diana", counter: 2 } as any);
    assert.deepStrictEqual(createdEvents, ["u4"]);
    assert.strictEqual(await sourceUserRepo.exists("u4"), true);
    assert.strictEqual(await targetUserRepo.exists("u4"), true);

    // Live patch on pre-existing source-only item ("u1") performs copy-on-write to target
    await repo.patch("u1", { displayName: "Alice Patched" } as any);
    assert.strictEqual(await targetUserRepo.exists("u1"), true);
    assert.strictEqual(((await targetUserRepo.get("u1")) as any).displayName, "Alice Patched");
    assert.strictEqual(((await targetUserRepo.get("u1")) as any).counter, 1);

    // Atomic operations on source-only item ("u2") perform copy-on-write to target
    await repo.incrementAttributes("u2", [{ property: "counter" as any, value: 3 }]);
    assert.strictEqual(await targetUserRepo.exists("u2"), true);
    assert.strictEqual(((await targetUserRepo.get("u2")) as any).counter, 8);

    await repo.setAttribute("u2", "extra" as any, "val");
    assert.strictEqual(((await targetUserRepo.get("u2")) as any).extra, "val");

    await repo.removeAttribute("u2", "extra" as any);
    assert.strictEqual(((await targetUserRepo.get("u2")) as any).extra, undefined);

    await repo.upsertItemToCollection("u2", "tags" as any, "b2");
    assert.deepStrictEqual(((await targetUserRepo.get("u2")) as any).tags, ["b", "b2"]);

    await repo.deleteItemFromCollection("u2", "tags" as any, 0);
    assert.deepStrictEqual(((await targetUserRepo.get("u2")) as any).tags, ["b2"]);

    // Live update on u3 copies full updated item to target
    await repo.update({ uuid: "u3", displayName: "Charlie Updated", counter: 11 } as any);
    assert.strictEqual(((await targetUserRepo.get("u3")) as any).displayName, "Charlie Updated");

    // Live upsert on u5 dual-writes
    await repo.upsert({ uuid: "u5", displayName: "Eve", counter: 1 } as any);
    assert.strictEqual(await sourceUserRepo.exists("u5"), true);
    assert.strictEqual(await targetUserRepo.exists("u5"), true);

    // Live delete removes from both source and target
    await repo.delete("u5");
    assert.strictEqual(await sourceUserRepo.exists("u5"), false);
    assert.strictEqual(await targetUserRepo.exists("u5"), false);

    // Seed one more item directly in source ("u6") that hasn't been touched by live writes
    await sourceUserRepo.create({ uuid: "u6", displayName: "Frank", counter: 20 } as any);
    assert.strictEqual(await targetUserRepo.exists("u6"), false);

    // Run migration to completion
    const status = await migration.runMigration({ batchSize: 2 });
    assert.strictEqual(status.state, "COMPLETED");
    assert.strictEqual(migration.isCompleted(), true);
    assert.strictEqual(await targetUserRepo.exists("u6"), true);
    assert.strictEqual(status.verified, 5); // u1, u2, u3, u4, u6

    // Once COMPLETED, reads and queries come from target (verify by mutating source directly)
    await sourceUserRepo.patch("u6", { displayName: "Stale Source Frank" } as any);
    assert.strictEqual((await repo.get("u6")).displayName, "Frank");
    assert.strictEqual((await repo.query("displayName = 'Frank'")).results.length, 1);

    // Post-completion writes execute on target first and mirror to source
    await repo.patch("u6", { displayName: "Target Frank" } as any);
    assert.strictEqual(((await targetUserRepo.get("u6")) as any).displayName, "Target Frank");
    assert.strictEqual(((await sourceUserRepo.get("u6")) as any).displayName, "Target Frank");

    await repo.create({ uuid: "u7", displayName: "Grace" } as any);
    assert.strictEqual(await targetUserRepo.exists("u7"), true);
    assert.strictEqual(await sourceUserRepo.exists("u7"), true);

    await repo.upsert({ uuid: "u8", displayName: "Heidi", counter: 4, tags: ["x"] } as any);
    await repo.update({ uuid: "u8", displayName: "Heidi 2", counter: 4, tags: ["x"] } as any);
    await repo.incrementAttributes("u8", [{ property: "counter" as any, value: 2 }]);
    await repo.setAttribute("u8", "extra" as any, "v");
    await repo.removeAttribute("u8", "extra" as any);
    await repo.upsertItemToCollection("u8", "tags" as any, "y");
    await repo.deleteItemFromCollection("u8", "tags" as any, 0);
    assert.strictEqual(((await sourceUserRepo.get("u8")) as any).counter, 6);
    assert.deepStrictEqual(((await sourceUserRepo.get("u8")) as any).tags, ["y"]);

    await repo.delete("u8");
    assert.strictEqual(await targetUserRepo.exists("u8"), false);
    assert.strictEqual(await sourceUserRepo.exists("u8"), false);

    // Calling runMigration again when already COMPLETED (without force) is a no-op
    const noopStatus = await migration.runMigration();
    assert.strictEqual(noopStatus.state, "COMPLETED");
  }

  @test
  async resumesInterruptedMigrationFromRegistryProgress() {
    const { migration } = await this.createStores({
      autoStart: false,
      batchSize: 2,
      models: ["Webda/User", "Webda/Ident"]
    });
    const sourceUserRepo = migration.getSourceRepository(User);
    const targetUserRepo = migration.getTargetRepository(User);
    const sourceIdentRepo = migration.getSourceRepository(Ident);
    const targetIdentRepo = migration.getTargetRepository(Ident);

    // 1 User (1 page < batchSize -> completed: true) and 3 Idents (2 pages -> aborts after 1st page of Idents)
    await sourceUserRepo.create({ uuid: "r1", displayName: "User 1" } as any);
    for (let i = 1; i <= 3; i++) {
      await sourceIdentRepo.create({ providerUid: `id${i}`, provider: "email" } as any);
    }

    // Abort right after the 2nd page progress is emitted (User completed, Ident on page 1 with continuationToken)
    let progressCount = 0;
    const onProgress = () => {
      progressCount++;
      if (progressCount === 2) {
        migration.off("MigrationStore.Progress", onProgress);
        (migration as any).abortRequested = true;
      }
    };
    migration.on("MigrationStore.Progress", onProgress);

    const partialStatus = await migration.runMigration({ batchSize: 2 });
    assert.strictEqual(partialStatus.state, "MIGRATING");
    assert.strictEqual(partialStatus.models["Webda/User"].completed, true);
    assert.strictEqual(partialStatus.models["Webda/Ident"].completed, false);
    assert.ok(partialStatus.continuationToken, "continuationToken should be saved in Registry");
    assert.strictEqual(await targetIdentRepo.exists({ providerUid: "id1", provider: "email" } as any), true);
    assert.strictEqual(await targetIdentRepo.exists({ providerUid: "id2", provider: "email" } as any), true);
    assert.strictEqual(await targetIdentRepo.exists({ providerUid: "id3", provider: "email" } as any), false);

    // Format status with completed=true, completed=false with token, and completed=false without token
    const formattedWithToken = migration.formatStatus(partialStatus);
    assert.ok(formattedWithToken.includes("token="));
    const formattedStart = migration.formatStatus({
      ...partialStatus,
      models: {
        "Webda/Ident": { model: "Webda/Ident", scanned: 0, migrated: 0, skipped: 0, completed: false }
      }
    });
    assert.ok(formattedStart.includes("token=start"));

    // Resume migration: skips completed Webda/User and finishes remaining Ident item
    const finalStatus = await migration.runMigration({ batchSize: 2 });
    assert.strictEqual(finalStatus.state, "COMPLETED");
    assert.strictEqual(finalStatus.scanned, 4);
    assert.strictEqual(finalStatus.migrated, 4);
    assert.strictEqual(finalStatus.verified, 4);
    assert.strictEqual(await targetUserRepo.exists("r1"), true);
    assert.strictEqual(await targetIdentRepo.exists({ providerUid: "id3", provider: "email" } as any), true);
  }

  @test
  async concurrentLiveWritesAndDeletesDuringBackfillArePreserved() {
    const { migration } = await this.createStores({ autoStart: false, batchSize: 5, models: ["Webda/User"] });
    const sourceUserRepo = migration.getSourceRepository(User);
    const targetUserRepo = migration.getTargetRepository(User);
    const repo = useRepository(User);

    await sourceUserRepo.create({ uuid: "c1", displayName: "Original C1" } as any);
    await sourceUserRepo.create({ uuid: "c2", displayName: "Original C2" } as any);
    await sourceUserRepo.create({ uuid: "c3", displayName: "Original C3" } as any);

    // Intercept sourceRepo.query during backfill so that AFTER the page snapshot is read from source,
    // live traffic updates "c1" and deletes "c2" before the backfill loop writes the page to target
    const origQuery = sourceUserRepo.query.bind(sourceUserRepo);
    let intercepted = false;
    sourceUserRepo.query = async (q: string) => {
      const res = await origQuery(q);
      if (!intercepted) {
        intercepted = true;
        await repo.patch("c1", { displayName: "Live Updated C1" } as any);
        await repo.delete("c2");
      }
      return res;
    };

    const status = await migration.runMigration({ batchSize: 5 });
    assert.strictEqual(status.state, "COMPLETED");

    // "c1" must keep the newer live update, not the stale page snapshot
    assert.strictEqual((await repo.get("c1")).displayName, "Live Updated C1");
    // "c2" must stay deleted and not be resurrected by the in-flight page snapshot
    assert.strictEqual(await targetUserRepo.exists("c2"), false);
    assert.strictEqual(await repo.exists("c2"), false);
    // "c3" was backfilled normally
    assert.strictEqual((await repo.get("c3")).displayName, "Original C3");
  }

  @test
  async synchronizesAcrossClusterLeaderAndFollowersViaRegistry() {
    const cluster = new MockClusterService("ClusterService", { type: "Webda/ClusterService" } as any);
    this.registerService(cluster, "ClusterService");
    cluster.resolve();
    await cluster.init();

    // Node 1 (leader with autoStart: true)
    const {
      source,
      target,
      migration: node1
    } = await this.createStores({
      autoStart: true,
      batchSize: 2,
      models: ["Webda/User"]
    });
    const sourceUserRepo = node1.getSourceRepository(User);
    await sourceUserRepo.create({ uuid: "k1", displayName: "Cluster 1" } as any);
    await sourceUserRepo.create({ uuid: "k2", displayName: "Cluster 2" } as any);
    await sourceUserRepo.create({ uuid: "k3", displayName: "Cluster 3" } as any);

    // Node 2 (follower sharing the same Registry,Source,Target, with statusRefreshInterval: 10ms)
    const node2 = new MigrationStore("MigratingUsers", {
      type: "Webda/MigrationStore",
      source: "SourceUsers",
      target: "TargetUsers",
      autoStart: false,
      statusRefreshInterval: 10
    } as any);
    (node2 as any).sourceStore = source;
    (node2 as any).targetStore = target;
    node2.computeParameters();
    await node2.init();

    // Before leader election, neither node has run the migration
    assert.strictEqual(node1.isCompleted(), false);
    assert.strictEqual((await node2.waitForCompletion()).state, "PENDING");

    // Seed a short active lease held by a previous runner so Node 1 schedules a retry timer first
    const registryId = "storeMigration.MigratingUsers.transfer";
    await useRegistry().put(registryId, {
      store: "MigratingUsers",
      source: "SourceUsers",
      target: "TargetUsers",
      state: "MIGRATING",
      models: {},
      owner: "previous-leader",
      leaseUntil: Date.now() + 25
    });

    // Elect Node 1 as cluster leader -> hits MigrationAlreadyRunning, schedules retryTimer
    cluster.setLeader(true);
    await node1.waitForCompletion();

    // Wait for retryTimer (25ms+) to fire and complete the migration
    await new Promise(resolve => setTimeout(resolve, 60));
    const status = await node1.waitForCompletion();
    assert.strictEqual(status.state, "COMPLETED");
    assert.strictEqual(node1.isCompleted(), true);

    // Calling startLeaderMigration again when already completed is a no-op
    (node1 as any).startLeaderMigration();

    // Wait >10ms so Node 2's statusRefreshInterval elapses on next read
    await new Promise(resolve => setTimeout(resolve, 20));
    const node2UserRepo = node2.getRepository(User);
    assert.strictEqual((await node2UserRepo.get("k1")).displayName, "Cluster 1");
    assert.strictEqual(node2.isCompleted(), true);

    // Test leadership loss callback (stopLeaderMigration + clearRetryTimer while timer/promise active)
    (node1 as any).retryTimer = setTimeout(() => {}, 10000);
    (node1 as any).backgroundPromise = Promise.resolve(status);
    cluster.setLeader(false);
    await (node1 as any).stopLeaderMigration();

    // Test executeLeaderMigration catching an unexpected error
    const origRun = node1.runMigration.bind(node1);
    node1.runMigration = async () => {
      throw new Error("unexpected failure");
    };
    const errStatus = await (node1 as any).executeLeaderMigration();
    assert.strictEqual(errStatus.state, "COMPLETED");
    node1.runMigration = origRun;

    await node1.stop();
    await node2.stop();
  }

  @test
  async rejectsConcurrentRunnerWhenLeaseIsActiveAndSupportsCliCommand() {
    const { migration } = await this.createStores({ autoStart: false, batchSize: 2, models: ["Webda/User"] });
    const sourceUserRepo = migration.getSourceRepository(User);
    await sourceUserRepo.create({ uuid: "m1", displayName: "M1" } as any);

    // Hold a live lease in Registry from another runner
    const registryId = "storeMigration.MigratingUsers.transfer";
    await useRegistry().put(registryId, {
      store: "MigratingUsers",
      source: "SourceUsers",
      target: "TargetUsers",
      state: "MIGRATING",
      models: {},
      owner: "other-runner",
      leaseUntil: Date.now() + 60000
    });

    await assert.rejects(
      () => migration.runMigration(),
      (err: unknown) => err instanceof MigrationAlreadyRunning
    );
    // CLI run command returns 1 when runMigration throws
    assert.strictEqual(await migration.migrateStoreCommand("run", 2), 1);

    // Release the lease and run via CLI command
    await useRegistry().patch(registryId, { leaseUntil: 0 }, "owner", "other-runner");

    assert.strictEqual(await migration.migrateStoreCommand("status"), 0);
    assert.strictEqual(await migration.migrateStoreCommand("run", 2), 0);
    assert.strictEqual(migration.isCompleted(), true);
    assert.strictEqual(await migration.migrateStoreCommand("force", 2), 0);

    // Also test runMigration with verify: false
    const unverifiedStatus = await migration.runMigration({ force: true, verify: false });
    assert.strictEqual(unverifiedStatus.state, "COMPLETED");
    assert.strictEqual(unverifiedStatus.verified, 0);

    // Verify module metadata exposes Webda/MigrationStore and its command
    const modda: any = useApplication().getModules().moddas["Webda/MigrationStore"];
    assert.ok(modda, "Webda/MigrationStore should be registered in webda.module.json");
    assert.ok(modda.commands["migrate-store"], "migrate-store command should be registered");

    // Clean data resets both stores and Registry entry (calling twice covers both exists=true and exists=false)
    await migration.__clean();
    await migration.__clean();
    assert.strictEqual(migration.isCompleted(), false);
    assert.strictEqual((await migration.getStatus()).state, "PENDING");
  }

  @test
  async bulkOperationsAndVerificationFailureState() {
    const { migration } = await this.createStores({ autoStart: false, batchSize: 2, models: ["Webda/User"] });
    const sourceUserRepo = migration.getSourceRepository(User);
    const targetUserRepo = migration.getTargetRepository(User);
    const repo = useRepository(User);

    await sourceUserRepo.create({ uuid: "b1", displayName: "Batch 1" });
    await sourceUserRepo.create({ uuid: "b2", displayName: "Batch 1" });
    await sourceUserRepo.create({ uuid: "b3", displayName: "Batch 2" });
    await sourceUserRepo.create({ uuid: "b4", displayName: "Batch 1" });

    // Bulk updateMany while migrating copies updated items to target
    const updatedCount = await repo.updateMany(
      "UPDATE SET displayName = 'Updated Batch' WHERE displayName = 'Batch 1'"
    );
    assert.strictEqual(updatedCount, 3);
    assert.strictEqual((await targetUserRepo.get("b1")).displayName, "Updated Batch");
    assert.strictEqual((await targetUserRepo.get("b2")).displayName, "Updated Batch");

    // Bulk deleteMany while migrating deletes multiple items from both source and target
    const deletedCount = await repo.deleteMany("DELETE WHERE uuid IN ['b2', 'b4']");
    assert.strictEqual(deletedCount, 2);
    assert.strictEqual(await sourceUserRepo.exists("b2"), false);
    assert.strictEqual(await targetUserRepo.exists("b2"), false);
    assert.strictEqual(await sourceUserRepo.exists("b4"), false);
    assert.strictEqual(await targetUserRepo.exists("b4"), false);

    // Simulate a broken target upsert during backfill so verification detects missing item and enters FAILED state
    const origUpsert = targetUserRepo.upsert.bind(targetUserRepo);
    targetUserRepo.upsert = async () => {
      // No-op so b3 is never written to target
      return new User();
    };

    await assert.rejects(() => migration.runMigration({ batchSize: 2 }), /Verification failed for Webda\/User/);
    const failedStatus = await migration.getStatus();
    assert.strictEqual(failedStatus.state, "FAILED");
    assert.ok(failedStatus.error?.includes("Verification failed"));
    assert.strictEqual(await migration.migrateStoreCommand("status"), 1);

    // Restore target upsert and re-run: recovers from FAILED to COMPLETED
    targetUserRepo.upsert = origUpsert;
    const recoveredStatus = await migration.runMigration({ batchSize: 2, force: true });
    assert.strictEqual(recoveredStatus.state, "COMPLETED");
  }
}
