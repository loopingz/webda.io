import { suite, test } from "@webda/test";
import * as assert from "assert";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { FAKE_KUBECONFIG } from "../../test/fixture.js";
import { KubernetesInformer } from "./informer.js";

type Item = { apiVersion: string; kind: string; metadata: { name: string; resourceVersion: string } };

/**
 * A fake API server serving `projects` of `example.com/v1`: the list, then a watch kept open
 */
class FakeApiServer {
  server: Server;
  items: Item[] = [];
  resourceVersion = 1;
  /** status codes answered to the next list requests instead of the list */
  listFailures: number[] = [];
  /** status codes answered to the next watch requests instead of the watch */
  watchFailures: number[] = [];
  lists: string[] = [];
  watches: ServerResponse[] = [];

  async start(): Promise<any> {
    this.server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>(resolve => this.server.listen(0, "127.0.0.1", resolve));
    const { port } = <any>this.server.address();
    return {
      ...FAKE_KUBECONFIG,
      clusters: [{ name: "fake", server: `http://127.0.0.1:${port}`, skipTLSVerify: true }]
    };
  }

  handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url!, "http://localhost");
    if (url.searchParams.get("watch") === "true") {
      const watchFailure = this.watchFailures.shift();
      if (watchFailure) {
        res.writeHead(watchFailure);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.flushHeaders();
      this.watches.push(res);
      return;
    }
    this.lists.push(url.pathname + url.search);
    const failure = this.listFailures.shift();
    if (failure) {
      res.writeHead(failure, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ kind: "Status", code: failure }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ metadata: { resourceVersion: `${this.resourceVersion}` }, items: this.items }));
  }

  item(name: string): Item {
    return {
      apiVersion: "example.com/v1",
      kind: "Project",
      metadata: { name, resourceVersion: `${++this.resourceVersion}` }
    };
  }

  /** Send a watch event to the open watches */
  send(type: "ADDED" | "MODIFIED" | "DELETED", object: Item) {
    for (const res of this.watches) {
      res.write(JSON.stringify({ type, object }) + "\n");
    }
  }

  /** Close the open watches, as the API server does on its request timeout */
  closeWatches() {
    this.watches.forEach(res => res.end());
    this.watches = [];
  }

  async stop() {
    this.server.closeAllConnections();
    await new Promise(resolve => this.server.close(resolve));
  }
}

/**
 * Wait until the condition holds
 * @param condition - checked every 10ms
 */
async function until(condition: () => boolean): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 5000) throw new Error("Timeout waiting for condition");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

@suite
class KubernetesInformerTest {
  api: FakeApiServer;
  informer: KubernetesInformer;

  async beforeEach() {
    this.api = new FakeApiServer();
  }

  async afterEach() {
    await this.informer?.stop();
    await this.api.stop();
  }

  @test
  async listThenWatch() {
    const config = await this.api.start();
    this.api.items = [this.api.item("a")];
    this.informer = new KubernetesInformer(
      { config },
      { group: "example.com", version: "v1", plural: "projects", labelSelector: "team=web" }
    );
    const events: string[] = [];
    let synced = 0;
    this.informer.on("add", obj => events.push(`add:${obj.metadata!.name}`));
    this.informer.on("update", obj => events.push(`update:${obj.metadata!.name}`));
    this.informer.on("delete", obj => events.push(`delete:${obj.metadata!.name}`));
    this.informer.on("synced", objects => {
      synced++;
      // The cache is up to date when synced is emitted
      assert.deepStrictEqual(
        this.informer.list().map(p => p.metadata!.name),
        objects.map(p => p.metadata!.name)
      );
    });
    assert.strictEqual(this.informer.synced, false);
    await this.informer.start();
    assert.strictEqual(this.informer.synced, true);
    assert.strictEqual(synced, 1);
    assert.deepStrictEqual(
      this.informer.list().map(p => p.metadata!.name),
      ["a"]
    );
    assert.ok(this.api.lists[0].startsWith("/apis/example.com/v1/projects"));
    assert.ok(this.api.lists[0].includes("labelSelector=team%3Dweb"));

    await until(() => this.api.watches.length === 1);
    this.api.send("ADDED", this.api.item("b"));
    this.api.send("MODIFIED", this.api.item("a"));
    this.api.send("DELETED", this.api.item("b"));
    await until(() => events.length === 4);
    assert.deepStrictEqual(events, ["add:a", "add:b", "update:a", "delete:b"]);
    assert.deepStrictEqual(
      this.informer.list().map(p => p.metadata!.name),
      ["a"]
    );
    assert.strictEqual(this.informer.get("a")?.metadata?.name, "a");
  }

  @test
  async namespaced() {
    const config = await this.api.start();
    this.informer = new KubernetesInformer(
      { config },
      { group: "example.com", version: "v1", plural: "projects", namespace: "team" }
    );
    await this.informer.start();
    assert.ok(this.api.lists[0].startsWith("/apis/example.com/v1/namespaces/team/projects"));
    await until(() => this.api.watches.length === 1);
  }

  @test
  async restartsAfterErrors() {
    const config = await this.api.start();
    this.api.listFailures = [500, 403];
    this.api.items = [this.api.item("a")];
    this.informer = new KubernetesInformer(
      { config },
      { group: "example.com", version: "v1", plural: "projects" },
      { restartDelay: 10, maxRestartDelay: 20 }
    );
    const errors: any[] = [];
    this.informer.on("error", err => errors.push(err));
    // The first list fails: start resolves, not synced yet
    await this.informer.start();
    assert.strictEqual(this.informer.synced, false);
    await until(() => this.informer.synced);
    assert.strictEqual(errors.length, 2);
    assert.strictEqual(this.api.lists.length, 3);
    assert.deepStrictEqual(
      this.informer.list().map(p => p.metadata!.name),
      ["a"]
    );
  }

  @test
  async rewatchesWhenTheServerClosesTheWatch() {
    const config = await this.api.start();
    this.informer = new KubernetesInformer({ config }, { group: "example.com", version: "v1", plural: "projects" });
    const added: string[] = [];
    this.informer.on("add", obj => added.push(obj.metadata!.name!));
    await this.informer.start();
    await until(() => this.api.watches.length === 1);
    this.api.closeWatches();
    await until(() => this.api.watches.length === 1);
    this.api.send("ADDED", this.api.item("c"));
    await until(() => added.length === 1);
    // The watch resumed from the last resource version: no new list
    assert.strictEqual(this.api.lists.length, 1);
  }

  @test
  async stopIsNotAnError() {
    const config = await this.api.start();
    this.informer = new KubernetesInformer({ config }, { group: "example.com", version: "v1", plural: "projects" });
    const errors: any[] = [];
    this.informer.on("error", err => errors.push(err));
    await this.informer.start();
    await until(() => this.api.watches.length === 1);
    await this.informer.stop();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepStrictEqual(errors, []);
  }

  @test
  async stopPreventsRestart() {
    const config = await this.api.start();
    this.api.listFailures = [500];
    this.informer = new KubernetesInformer(
      { config },
      { group: "example.com", version: "v1", plural: "projects" },
      { restartDelay: 50 }
    );
    await this.informer.start();
    await this.informer.stop();
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.strictEqual(this.api.lists.length, 1);
  }

  @test
  async restartsTheWatchAfterAnError() {
    const config = await this.api.start();
    this.api.watchFailures = [403];
    this.informer = new KubernetesInformer(
      { config },
      { group: "example.com", version: "v1", plural: "projects" },
      { restartDelay: 10 }
    );
    const errors: any[] = [];
    const added: string[] = [];
    const listener = (obj: any) => added.push(obj.metadata.name);
    let watching = 0;
    this.informer.on("error", err => errors.push(err));
    this.informer.on("watching", () => watching++);
    this.informer.on("add", listener);
    await this.informer.start();
    await until(() => this.api.watches.length === 1);
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].statusCode, 403);
    // Only the accepted watch
    await until(() => watching === 1);
    this.informer.off("add", listener);
    this.api.send("ADDED", this.api.item("d"));
    await until(() => this.informer.get("d") !== undefined);
    assert.deepStrictEqual(added, []);
    assert.strictEqual(watching, 1);
  }
}
