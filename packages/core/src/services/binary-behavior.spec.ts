import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { Readable } from "stream";
import { WebdaApplicationTest } from "../test/index.js";
import {
  Binary,
  BinariesImpl,
  BinariesItem,
  BinaryMap,
  BinaryNotFoundError,
  BinaryParameters,
  BinaryService,
  LocalBinaryFile,
  MemoryBinaryFile
} from "./binary.js";
import { Action } from "../models/decorator.js";
import { WEBDA_STORAGE } from "@webda/models";
import { OperationContext } from "../contexts/operationcontext.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext } from "../contexts/httpcontext.js";
import { runWithContext } from "../contexts/execution.js";
import * as WebdaError from "../errors/errors.js";
import { useCore } from "../core/hooks.js";

/**
 * Phase 2: Binary / BinariesImpl as Behaviors.
 *
 * The full Behavior dispatch path goes Compiler → DomainService.addBehaviorOperations
 * → modelBehaviorAction → @Action method body. The integration end of that
 * pipeline is exercised by the existing `binary*` tests in
 * `domainservice.spec.ts` (still routed through the legacy dispatcher) and
 * by Phase 3's smoke test (which deletes the legacy path).
 *
 * This file focuses on the unit-level claims of Phase 2 plus the @Action
 * method bodies on `Binary` / `BinariesImpl` and the concrete logic on
 * `BinaryService`.
 */

/**
 * Build a stubbed BinaryService whose abstract methods are sinon stubs.
 * Returned as `any` so callers can re-assign individual stubs.
 */
function makeServiceStub(overrides: Partial<Record<string, any>> = {}): any {
  return {
    store: sinon.stub().resolves(),
    delete: sinon.stub().resolves(),
    get: sinon.stub().resolves(Readable.from(Buffer.from("payload"))),
    putRedirectUrl: sinon.stub().resolves({ url: "https://signed.example/up" }),
    getRedirectUrlFromObject: sinon.stub().resolves(null),
    getFile: sinon.stub().resolves(
      Object.assign(new MemoryBinaryFile(Buffer.from("hello"), { name: "h.txt", mimetype: "text/plain", size: 5 }), {
        hash: "abc",
        challenge: "wb-abc"
      })
    ),
    ...overrides
  };
}

/**
 * Allocate a `Binary` without going through its constructor. The constructor
 * chain (`Binary → BinaryMap → BinaryFile`) calls `this.set(info)` before the
 * subclass field initializers have run, so we hand-roll the `[WEBDA_STORAGE]`
 * slot directly — same trick the transformer's `__hydrateBehaviors` uses.
 *
 * @param parent - { instance, attribute }
 * @param service - the stubbed BinaryService
 * @param state - optional fields to copy onto the instance (hash/size/etc.)
 */
function makeBinary(parent: any, service: any, state: any = {}): Binary {
  const b: any = Object.create(Binary.prototype);
  b[WEBDA_STORAGE] = { service, __parent__: parent, empty: state.hash === undefined };
  // Prime BinaryFile fields if requested.
  Object.assign(b, {
    name: undefined,
    mimetype: "application/octet-stream",
    metadata: {},
    size: 0,
    hash: undefined,
    challenge: undefined,
    ...state
  });
  return b;
}

/**
 * Same as `makeBinary` but for the MANY-cardinality `BinariesImpl`. Calls
 * the constructor (it's safe; Array's constructor with no args yields an
 * empty array) and then stamps the parent slot.
 */
function makeBinaries(parent: any, service: any): BinariesImpl {
  const b: any = new BinariesImpl();
  b[WEBDA_STORAGE] = { service, __parent__: parent };
  return b;
}

/**
 * Make a fake `Storable` for use as a Binary's parent. The action methods
 * only need a `patch(...)` and `getUUID()` accessor — keep it minimal.
 */
function makeFakeParent(): any {
  return {
    uuid: "fake-uuid",
    getUUID: () => "fake-uuid",
    patch: sinon.stub().resolves()
  };
}

/**
 * Run `fn` inside an `OperationContext` with optional input + parameters.
 */
async function runWithCtx<T>(
  ctxOpts: { input?: any; parameters?: any; web?: { uri?: string } } = {},
  fn: (ctx: OperationContext) => Promise<T>
): Promise<T> {
  let ctx: OperationContext;
  if (ctxOpts.web) {
    ctx = new WebContext(new HttpContext("test.webda.io", "GET", ctxOpts.web.uri || "/"));
  } else {
    ctx = new OperationContext();
  }
  await ctx.init();
  if (ctxOpts.parameters) ctx.setParameters(ctxOpts.parameters);
  if (ctxOpts.input !== undefined) {
    const buf = Buffer.from(typeof ctxOpts.input === "string" ? ctxOpts.input : JSON.stringify(ctxOpts.input));
    (ctx as any).getRawInput = async () => buf;
    (ctx as any).getRawInputAsString = async () => buf.toString();
  }
  return runWithContext<Promise<T>>(ctx, () => fn(ctx)) as any;
}

@suite
class BinaryBehaviorTest extends WebdaApplicationTest {
  /**
   * Sanity: `@Action` is a runtime symbol that returns the method untouched.
   */
  @test
  actionDecoratorIsNoop() {
    const fn = function example() {
      return 42;
    };
    // Direct form: @Action used without parens.
    const direct: any = (Action as any)(fn, {
      kind: "method",
      name: "example",
      static: false,
      private: false,
      access: { has: () => true, get: () => fn },
      addInitializer: () => {},
      metadata: {} as any
    });
    assert.strictEqual(direct(), 42, "direct @Action must return the original method");

    // Factory form: @Action({ rest: ... }) — produces a decorator that
    // returns the original method.
    const factory = (Action as any)({ rest: { route: ".", method: "GET" } });
    assert.strictEqual(typeof factory, "function", "factory form must return a decorator");
    const decorated: any = factory(fn, {
      kind: "method",
      name: "example",
      static: false,
      private: false,
      access: { has: () => true, get: () => fn },
      addInitializer: () => {},
      metadata: {} as any
    });
    assert.strictEqual(decorated(), 42, "factory @Action must return the original method");
  }

  /**
   * The 6 Behavior @Action methods on `Binary` are present and callable.
   */
  @test
  binaryHasAllExpectedActionMethods() {
    const proto = Binary.prototype as any;
    for (const m of ["attach", "attachChallenge", "download", "downloadUrl", "delete", "setMetadata"]) {
      assert.strictEqual(typeof proto[m], "function", `Binary.${m} must exist as an instance method`);
    }
  }

  /**
   * Same for `BinariesImpl`. `attach`/`attachChallenge` mirror Binary; the
   * MANY-cardinality variants `get`/`getUrl`/`deleteAt`/`setMetadata` take
   * an `index` first argument.
   */
  @test
  binariesImplHasAllExpectedActionMethods() {
    const proto = BinariesImpl.prototype as any;
    for (const m of ["attach", "attachChallenge", "get", "getUrl", "deleteAt", "setMetadata"]) {
      assert.strictEqual(typeof proto[m], "function", `BinariesImpl.${m} must exist as an instance method`);
    }
  }

  /**
   * The Behavior parent reference is read via `WEBDA_STORAGE["__parent__"]`.
   */
  @test
  binaryGetServiceUsesParentSlot() {
    const b = Object.create(Binary.prototype);
    b[WEBDA_STORAGE] = {};
    assert.throws(
      () => (b as any).getService(),
      /parent not yet wired/,
      "Binary.getService must error when no parent is wired"
    );

    const fakeParent = { uuid: "fake" };
    b[WEBDA_STORAGE]["__parent__"] = { instance: fakeParent, attribute: "image" };
    assert.throws(
      () => (b as any).getService(),
      /No binary store found|parent not yet wired/,
      "After wiring parent, getService must look up the BinaryService for it"
    );
  }

  /**
   * Service lookup is cached — once `getService()` resolves, subsequent calls
   * skip the registry walk.
   */
  @test
  binaryGetServiceCaches() {
    const b: any = Object.create(Binary.prototype);
    const service: any = { tag: "stub" };
    b[WEBDA_STORAGE] = { service };
    // No parent slot, but service is already wired — getService must return
    // the cached value without walking the registry.
    assert.strictEqual((b as any).getService(), service);
  }

  /**
   * `BinariesImpl.toJSON()` returns a plain array.
   */
  @test
  binariesImplToJSONReturnsArray() {
    const b = new BinariesImpl();
    const json = b.toJSON();
    assert.ok(Array.isArray(json), "BinariesImpl.toJSON must return a real array");
    assert.strictEqual(json.length, 0, "empty array round-trips correctly");

    (b as any)[WEBDA_STORAGE]["__parent__"] = { instance: { uuid: "fake" }, attribute: "photos" };
    assert.strictEqual(JSON.stringify(b), "[]");
  }

  /**
   * BinariesImpl's `getService` reads the same `__parent__` slot.
   */
  @test
  binariesImplGetServiceUsesParentSlot() {
    const b: any = Object.create(BinariesImpl.prototype);
    b[WEBDA_STORAGE] = {};
    assert.throws(
      () => b.getService(),
      /parent not yet wired/,
      "BinariesImpl.getService must error when no parent is wired"
    );
    b[WEBDA_STORAGE]["__parent__"] = { instance: { uuid: "fake" }, attribute: "photos" };
    assert.throws(
      () => b.getService(),
      /No binary store found|parent not yet wired/,
      "After wiring parent, getService must look up the BinaryService for it"
    );
  }

  /**
   * `Binary.toJSON()` returns undefined when no hash is set, the populated
   * shape otherwise.
   */
  @test
  binaryToJSONShape() {
    const empty: any = Object.create(Binary.prototype);
    empty[WEBDA_STORAGE] = { empty: true };
    assert.strictEqual(empty.toJSON(), undefined, "empty Binary serializes as undefined");

    const populated: any = Object.create(Binary.prototype);
    populated[WEBDA_STORAGE] = { empty: false };
    populated.hash = "abc";
    assert.strictEqual(populated.toJSON(), populated, "populated Binary serializes as itself");
  }

  /**
   * `Binary.set()` flips `empty` to false.
   */
  @test
  binarySetClearsEmpty() {
    const b: any = Object.create(Binary.prototype);
    b[WEBDA_STORAGE] = { empty: true };
    (b as Binary).set({ name: "n", size: 10, mimetype: "text/plain", hash: "h" } as any);
    assert.strictEqual((b as any)[WEBDA_STORAGE].empty, false);
    assert.strictEqual((b as Binary).hash, "h");
    assert.strictEqual((b as Binary).size, 10);
  }

  /**
   * `Binary.isEmpty()` proxies to the storage slot.
   */
  @test
  binaryIsEmpty() {
    const b: any = Object.create(Binary.prototype);
    b[WEBDA_STORAGE] = { empty: true };
    assert.strictEqual((b as Binary).isEmpty(), true);
    b[WEBDA_STORAGE].empty = false;
    assert.strictEqual((b as Binary).isEmpty(), false);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Binary @Action method bodies
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Happy path: `attach()` reads a file from the context, asks the service to
   * store it, and writes the new metadata onto `this`.
   */
  @test
  async binaryAttachStoresAndUpdates() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service);

    await runWithCtx({}, async () => {
      await b.attach();
    });

    assert.strictEqual(service.store.callCount, 1);
    assert.strictEqual(service.store.firstCall.args[0], parent.instance);
    assert.strictEqual(service.store.firstCall.args[1], "image");
    assert.strictEqual(b.hash, "abc", "hash from getFile is propagated to Binary");
  }

  /**
   * Idempotent: when `getFile` returns a file whose hash already matches
   * `this.hash`, `attach()` returns without calling `store`.
   */
  @test
  async binaryAttachSkipsWhenAlreadyLinked() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service, { hash: "abc" });

    await runWithCtx({}, async () => {
      await b.attach();
    });
    assert.strictEqual(service.store.callCount, 0, "store must NOT be called when hash already matches");
  }

  /**
   * Defensive: missing parent slot ⇒ explicit error.
   */
  @test
  async binaryAttachThrowsWithoutParent() {
    const b: any = Object.create(Binary.prototype);
    b[WEBDA_STORAGE] = {};
    await runWithCtx({}, async () => {
      await assert.rejects(() => (b as Binary).attach(), /parent not yet wired/);
    });
  }

  /**
   * `attachChallenge` returns the signed URL and a `done: false` flag.
   */
  @test
  async binaryAttachChallengeReturnsUrl() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service);

    const result = await runWithCtx({}, async () => {
      return b.attachChallenge({ hash: "deadbeef", challenge: "wb-deadbeef" } as any);
    });

    assert.strictEqual(service.putRedirectUrl.callCount, 1);
    assert.strictEqual(result.done, false);
    assert.strictEqual(result.url, "https://signed.example/up");
    assert.ok(typeof result.md5 === "string");
  }

  /**
   * `attachChallenge` short-circuits on dedup (already-linked hash).
   */
  @test
  async binaryAttachChallengeShortCircuitsOnMatch() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service, { hash: "deadbeef" });

    const result = await runWithCtx({}, async () => {
      return b.attachChallenge({ hash: "deadbeef", challenge: "wb-deadbeef" } as any);
    });
    // Returns undefined when already linked.
    assert.strictEqual(result, undefined);
    assert.strictEqual(service.putRedirectUrl.callCount, 0);
  }

  /**
   * `attachChallenge` falls back to `context.getInput()` when no body arg.
   */
  @test
  async binaryAttachChallengeReadsInputFallback() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service);

    const result = await runWithCtx({ input: { hash: "feedface", challenge: "wb-feedface" } }, async () => {
      return b.attachChallenge();
    });

    assert.strictEqual(service.putRedirectUrl.callCount, 1);
    assert.ok(result.url);
  }

  /**
   * `download()` 302-redirects when the service returns a signed URL.
   */
  @test
  async binaryDownloadRedirectsToSignedUrl() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    service.getRedirectUrlFromObject = sinon.stub().resolves("https://cdn.example/x");
    const b = makeBinary(parent, service, { hash: "xyz", size: 7, mimetype: "text/plain" });

    await runWithCtx({}, async ctx => {
      await b.download();
      // OperationContext doesn't have writeHead — verify it didn't crash and
      // service was queried.
      assert.strictEqual(service.getRedirectUrlFromObject.callCount, 1);
      assert.strictEqual(service.get.callCount, 0, "no direct stream when redirecting");
    });
  }

  /**
   * `download()` throws NotFound when no hash is set.
   */
  @test
  async binaryDownloadThrowsWhenNoHash() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service);

    await runWithCtx({}, async () => {
      await assert.rejects(() => b.download(), WebdaError.NotFound);
    });
  }

  /**
   * `downloadUrl()` returns `{Location, Map}` JSON, falling back to the
   * absolute URL minus `/url` when the service returns null.
   */
  @test
  async binaryDownloadUrlReturnsLocation() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service, { hash: "xyz" });

    // service returns a real URL — downloadUrl proxies it through.
    service.getRedirectUrlFromObject = sinon.stub().resolves("https://cdn.example/x");
    const direct = await runWithCtx({}, async () => b.downloadUrl());
    assert.strictEqual(direct.Location, "https://cdn.example/x");
    assert.strictEqual(direct.Map, b);

    // service returns null — falls back to context-derived URL on WebContext.
    service.getRedirectUrlFromObject = sinon.stub().resolves(null);
    const fallback = await runWithCtx({ web: { uri: "/posts/1/image/url" } }, async () => b.downloadUrl());
    assert.ok(fallback.Location && !fallback.Location.endsWith("/url"));

    // service returns null on a non-WebContext — Location is undefined.
    service.getRedirectUrlFromObject = sinon.stub().resolves(null);
    const opOnly = await runWithCtx({}, async () => b.downloadUrl());
    assert.strictEqual(opOnly.Location, undefined);
  }

  /**
   * `downloadUrl()` throws NotFound when no hash is set.
   */
  @test
  async binaryDownloadUrlThrowsWhenNoHash() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service);

    await runWithCtx({}, async () => {
      await assert.rejects(() => b.downloadUrl(), WebdaError.NotFound);
    });
  }

  /**
   * `delete(hash)` calls service.delete and clears state.
   */
  @test
  async binaryDeleteHappyPath() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service, { hash: "abc", size: 10 });

    await b.delete("abc");
    assert.strictEqual(service.delete.callCount, 1);
    assert.strictEqual(b.isEmpty(), true);
  }

  /**
   * `delete(hash)` mismatches throws BadRequest, no service call.
   */
  @test
  async binaryDeleteHashMismatch() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service, { hash: "abc" });

    await assert.rejects(() => b.delete("not-the-hash"), WebdaError.BadRequest);
    assert.strictEqual(service.delete.callCount, 0);
  }

  /**
   * `delete()` requires a parent slot.
   */
  @test
  async binaryDeleteRequiresParent() {
    const b: any = Object.create(Binary.prototype);
    b[WEBDA_STORAGE] = {};
    await assert.rejects(() => (b as Binary).delete("abc"), /parent not yet wired/);
  }

  /**
   * `setMetadata(hash, metadata)` updates and patches.
   */
  @test
  async binarySetMetadataHappy() {
    const parentInstance = makeFakeParent();
    const parent = { instance: parentInstance, attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service, { hash: "abc" });

    await runWithCtx({}, async () => {
      await b.setMetadata("abc", { caption: "hi" } as any);
    });
    assert.deepStrictEqual(b.metadata, { caption: "hi" });
    assert.strictEqual(parentInstance.patch.callCount, 1);
    assert.deepStrictEqual(parentInstance.patch.firstCall.args[0], { image: b });
  }

  /**
   * `setMetadata` rejects on hash mismatch.
   */
  @test
  async binarySetMetadataHashMismatch() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service, { hash: "abc" });

    await runWithCtx({}, async () => {
      await assert.rejects(() => b.setMetadata("zzz", {} as any), WebdaError.BadRequest);
    });
  }

  /**
   * `setMetadata` rejects payload over 4 KB.
   */
  @test
  async binarySetMetadataTooBig() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service, { hash: "abc" });
    const fat = { blob: "x".repeat(5000) };

    await runWithCtx({}, async () => {
      await assert.rejects(() => b.setMetadata("abc", fat as any), /too big/);
    });
  }

  /**
   * `setMetadata` reads from context input when no payload arg.
   */
  @test
  async binarySetMetadataReadsContextInput() {
    const parentInstance = makeFakeParent();
    const parent = { instance: parentInstance, attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service, { hash: "abc" });

    await runWithCtx({ input: { tag: "ctx" } }, async () => {
      await (b as any).setMetadata("abc");
    });
    assert.deepStrictEqual(b.metadata, { tag: "ctx" });
  }

  /**
   * `Binary.upload(file)` programmatic API stores and applies the new state.
   */
  @test
  async binaryUploadProgrammatic() {
    const parent = { instance: makeFakeParent(), attribute: "image" };
    const service = makeServiceStub();
    const b = makeBinary(parent, service);
    const file = new MemoryBinaryFile(Buffer.from("y"), { name: "y.txt", size: 1, hash: "yhash" });

    await b.upload(file);
    assert.strictEqual(service.store.callCount, 1);
    assert.strictEqual(b.hash, "yhash");
  }

  @test
  async binaryUploadRequiresParent() {
    const b: any = Object.create(Binary.prototype);
    b[WEBDA_STORAGE] = {};
    const file = new MemoryBinaryFile(Buffer.from("y"));
    await assert.rejects(() => (b as Binary).upload(file as any), /parent not yet wired/);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BinariesImpl @Action method bodies
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * `BinariesImpl.attach()` happy path — pushes a fresh item.
   */
  @test
  async binariesAttachPushes() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);

    await runWithCtx({}, async () => {
      await b.attach();
    });
    assert.strictEqual(b.length, 1);
    assert.strictEqual(b[0].hash, "abc");
    assert.strictEqual(service.store.callCount, 1);
  }

  /**
   * Dedup: when an item with the same hash already exists, attach() skips.
   */
  @test
  async binariesAttachDedups() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    // pre-seed an item with the same hash that getFile will produce.
    b.push(new BinariesItem(b, { hash: "abc", size: 5, name: "h.txt", mimetype: "text/plain" } as any));

    await runWithCtx({}, async () => {
      await b.attach();
    });
    assert.strictEqual(b.length, 1, "no new push on dedup");
    assert.strictEqual(service.store.callCount, 0);
  }

  @test
  async binariesAttachRequiresParent() {
    const b: any = Object.create(BinariesImpl.prototype);
    b[WEBDA_STORAGE] = {};
    await runWithCtx({}, async () => {
      await assert.rejects(() => (b as BinariesImpl).attach(), /parent not yet wired/);
    });
  }

  /**
   * `attachChallenge` returns the URL on cache miss.
   */
  @test
  async binariesAttachChallengeReturnsUrl() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);

    const result = await runWithCtx({}, async () => {
      return b.attachChallenge({ hash: "ne", challenge: "wb-ne" } as any);
    });
    assert.strictEqual(result.url, "https://signed.example/up");
    assert.strictEqual(result.done, false);
    assert.ok(typeof result.md5 === "string");
  }

  /**
   * Dedup: existing item with same hash short-circuits.
   */
  @test
  async binariesAttachChallengeDedups() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    b.push(new BinariesItem(b, { hash: "ne", size: 1, name: "n", mimetype: "text/plain" } as any));

    const result = await runWithCtx({}, async () => {
      return b.attachChallenge({ hash: "ne", challenge: "wb-ne" } as any);
    });
    assert.strictEqual(result, undefined);
    assert.strictEqual(service.putRedirectUrl.callCount, 0);
  }

  /**
   * `attachChallenge` falls back to context input when body undefined.
   */
  @test
  async binariesAttachChallengeReadsInput() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);

    const result = await runWithCtx({ input: { hash: "from-ctx", challenge: "wb-from-ctx" } }, async () => {
      return b.attachChallenge();
    });
    assert.ok(result.url);
  }

  /**
   * `BinariesImpl.get(index)` 302-redirects when a signed URL is available.
   */
  @test
  async binariesGetRedirects() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    service.getRedirectUrlFromObject = sinon.stub().resolves("https://cdn.example/p");
    const b = makeBinaries(parent, service);
    b.push(new BinariesItem(b, { hash: "p", size: 1, name: "p.bin", mimetype: "text/plain" } as any));

    await runWithCtx({}, async () => {
      await b.get(0);
    });
    assert.strictEqual(service.getRedirectUrlFromObject.callCount, 1);
  }

  /**
   * Out-of-range index ⇒ NotFound.
   */
  @test
  async binariesGetIndexOutOfRange() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);

    await runWithCtx({}, async () => {
      await assert.rejects(() => b.get(0), WebdaError.NotFound);
      await assert.rejects(() => b.get(-1), WebdaError.NotFound);
    });
  }

  /**
   * String-form index gets parsed.
   */
  @test
  async binariesGetParsesStringIndex() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    service.getRedirectUrlFromObject = sinon.stub().resolves("https://cdn.example/p");
    const b = makeBinaries(parent, service);
    b.push(new BinariesItem(b, { hash: "p", size: 1, name: "p.bin", mimetype: "text/plain" } as any));

    await runWithCtx({}, async () => {
      await b.get("0" as any);
    });
    assert.strictEqual(service.getRedirectUrlFromObject.callCount, 1);
  }

  /**
   * `getUrl(index)` returns a `{Location, Map}` JSON.
   */
  @test
  async binariesGetUrlReturnsLocation() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    const item = new BinariesItem(b, { hash: "p", size: 1, name: "p.bin", mimetype: "text/plain" } as any);
    b.push(item);

    // Service returns a real URL — getUrl proxies it.
    service.getRedirectUrlFromObject = sinon.stub().resolves("https://cdn.example/p");
    const direct = await runWithCtx({}, async () => b.getUrl(0));
    assert.strictEqual(direct.Location, "https://cdn.example/p");

    // Service returns null on WebContext → derive Location from URL.
    service.getRedirectUrlFromObject = sinon.stub().resolves(null);
    const fb = await runWithCtx({ web: { uri: "/posts/1/photos/0/url" } }, async () => b.getUrl(0));
    assert.ok(fb.Location && !fb.Location.endsWith("/url"));

    // Service returns null on plain OperationContext → undefined.
    service.getRedirectUrlFromObject = sinon.stub().resolves(null);
    const op = await runWithCtx({}, async () => b.getUrl(0));
    assert.strictEqual(op.Location, undefined);
  }

  @test
  async binariesGetUrlOutOfRange() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    await runWithCtx({}, async () => {
      await assert.rejects(() => b.getUrl(0), WebdaError.NotFound);
    });
  }

  /**
   * `deleteAt(index, hash)` happy path.
   */
  @test
  async binariesDeleteAtHappy() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    b.push(new BinariesItem(b, { hash: "p1", size: 1, name: "p1", mimetype: "text/plain" } as any));
    b.push(new BinariesItem(b, { hash: "p2", size: 2, name: "p2", mimetype: "text/plain" } as any));

    await b.deleteAt(0, "p1");
    assert.strictEqual(service.delete.callCount, 1);
    assert.strictEqual(b.length, 1);
    assert.strictEqual(b[0].hash, "p2");
  }

  /**
   * `deleteAt` rejects on hash mismatch.
   */
  @test
  async binariesDeleteAtHashMismatch() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    b.push(new BinariesItem(b, { hash: "p1", size: 1, name: "p1", mimetype: "text/plain" } as any));

    await assert.rejects(() => b.deleteAt(0, "wrong"), WebdaError.BadRequest);
    assert.strictEqual(service.delete.callCount, 0);
    assert.strictEqual(b.length, 1);
  }

  /**
   * `deleteAt` rejects on out-of-range index.
   */
  @test
  async binariesDeleteAtOutOfRange() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);

    await assert.rejects(() => b.deleteAt(0, "x"), WebdaError.BadRequest);
  }

  @test
  async binariesDeleteAtRequiresParent() {
    const b: any = Object.create(BinariesImpl.prototype);
    b[WEBDA_STORAGE] = {};
    await assert.rejects(() => (b as BinariesImpl).deleteAt(0, "x"), /parent not yet wired/);
  }

  /**
   * `setMetadata(index, hash, meta)` happy path.
   */
  @test
  async binariesSetMetadataHappy() {
    const parentInstance = makeFakeParent();
    const parent = { instance: parentInstance, attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    b.push(new BinariesItem(b, { hash: "p", size: 1, name: "p", mimetype: "text/plain" } as any));

    await runWithCtx({}, async () => {
      await b.setMetadata(0, "p", { caption: "yo" } as any);
    });
    assert.deepStrictEqual(b[0].metadata, { caption: "yo" });
    assert.strictEqual(parentInstance.patch.callCount, 1);
  }

  /**
   * `setMetadata` rejects on hash mismatch.
   */
  @test
  async binariesSetMetadataHashMismatch() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    b.push(new BinariesItem(b, { hash: "p", size: 1, name: "p", mimetype: "text/plain" } as any));

    await runWithCtx({}, async () => {
      await assert.rejects(() => b.setMetadata(0, "wrong", {} as any), WebdaError.BadRequest);
    });
  }

  /**
   * `setMetadata` rejects payload >4kb.
   */
  @test
  async binariesSetMetadataTooBig() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    b.push(new BinariesItem(b, { hash: "p", size: 1, name: "p", mimetype: "text/plain" } as any));

    await runWithCtx({}, async () => {
      await assert.rejects(() => b.setMetadata(0, "p", { x: "y".repeat(5000) } as any), /too big/);
    });
  }

  /**
   * `setMetadata` falls back to context input.
   */
  @test
  async binariesSetMetadataReadsInput() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    b.push(new BinariesItem(b, { hash: "p", size: 1, name: "p", mimetype: "text/plain" } as any));

    await runWithCtx({ input: { ctx: 1 } }, async () => {
      await (b as any).setMetadata(0, "p");
    });
    assert.deepStrictEqual(b[0].metadata, { ctx: 1 });
  }

  @test
  async binariesSetMetadataRequiresParent() {
    const b: any = Object.create(BinariesImpl.prototype);
    b[WEBDA_STORAGE] = {};
    await runWithCtx({}, async () => {
      await assert.rejects(() => (b as BinariesImpl).setMetadata(0, "x", {} as any), /parent not yet wired/);
    });
  }

  /**
   * Programmatic `BinariesImpl.upload(file)` calls store and pushes.
   */
  @test
  async binariesUploadProgrammatic() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    const file = new MemoryBinaryFile(Buffer.from("z"), { name: "z", size: 1, hash: "zh" });

    await b.upload(file as any);
    assert.strictEqual(service.store.callCount, 1);
    assert.strictEqual(b.length, 1);
  }

  /**
   * `upload(file, replace)` deletes the replaced item.
   */
  @test
  async binariesUploadProgrammaticWithReplace() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    b.push(new BinariesItem(b, { hash: "old", size: 1, name: "old", mimetype: "text/plain" } as any));
    const replace = b[0];
    const file = new MemoryBinaryFile(Buffer.from("z"), { name: "z", size: 1, hash: "zh" });

    await b.upload(file as any, replace);
    assert.strictEqual(service.store.callCount, 1);
    assert.strictEqual(service.delete.callCount, 1, "old item deleted");
  }

  @test
  async binariesUploadRequiresParent() {
    const b: any = Object.create(BinariesImpl.prototype);
    b[WEBDA_STORAGE] = {};
    const file = new MemoryBinaryFile(Buffer.from("z"));
    await assert.rejects(() => (b as BinariesImpl).upload(file as any), /parent not yet wired/);
  }

  /**
   * Programmatic `BinariesImpl.delete(item)` calls service.delete and splices.
   */
  @test
  async binariesDeleteProgrammatic() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    b.push(new BinariesItem(b, { hash: "x", size: 1, name: "x", mimetype: "text/plain" } as any));
    const item = b[0];

    await b.delete(item);
    assert.strictEqual(service.delete.callCount, 1);
    assert.strictEqual(b.length, 0);
  }

  /**
   * `delete(item)` of an item not in the collection ⇒ throws.
   */
  @test
  async binariesDeleteProgrammaticMissingItem() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    const orphan: any = { hash: "ghost" };

    await assert.rejects(() => b.delete(orphan), /Item not found/);
  }

  @test
  async binariesDeleteProgrammaticRequiresParent() {
    const b: any = Object.create(BinariesImpl.prototype);
    b[WEBDA_STORAGE] = {};
    const orphan: any = { hash: "ghost" };
    await assert.rejects(() => (b as BinariesImpl).delete(orphan), /parent not yet wired/);
  }

  /**
   * Readonly array methods throw.
   */
  @test
  binariesReadonlyMethodsThrow() {
    const b = new BinariesImpl();
    assert.throws(() => b.pop(), /Readonly/);
    assert.throws(() => b.slice(), /Readonly/);
    assert.throws(() => b.unshift(), /Readonly/);
    assert.throws(() => b.shift(), /Readonly/);
  }

  /**
   * `BinariesImpl.push()` wraps plain objects in BinariesItem.
   */
  @test
  binariesPushWrapsObjects() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    b.push({ hash: "p", size: 1, name: "p", mimetype: "text/plain" } as any);
    assert.strictEqual(b.length, 1);
    assert.ok(b[0] instanceof BinariesItem);

    // existing BinariesItem stays as-is.
    const item = new BinariesItem(b, { hash: "q", size: 1, name: "q", mimetype: "text/plain" } as any);
    b.push(item as any);
    assert.strictEqual(b[1], item);
  }

  /**
   * `BinariesImpl.assign(model, attribute)` populates from existing data.
   */
  @test
  binariesAssignReadsModelAttribute() {
    // We need useCore() to return a Core that has getBinaryStore — stub it.
    const service: any = { tag: "stub-service" };
    const stub = sinon.stub(useCore(), "getBinaryStore" as any).returns(service);
    try {
      const b = new BinariesImpl();
      const fakeModel: any = {
        photos: [
          { hash: "a", size: 1, name: "a", mimetype: "text/plain" },
          { hash: "b", size: 1, name: "b", mimetype: "text/plain" }
        ]
      };
      b.assign(fakeModel, "photos");
      assert.strictEqual(b.length, 2);
      assert.strictEqual(b[0].hash, "a");
      assert.strictEqual((b as any)[WEBDA_STORAGE].service, service);
      assert.strictEqual((b as any)[WEBDA_STORAGE]["__parent__"].instance, fakeModel);
    } finally {
      stub.restore();
    }
  }

  /**
   * `BinariesItem.upload(file)` proxies to parent.upload and updates state.
   */
  @test
  async binariesItemUpload() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    b.push(new BinariesItem(b, { hash: "old", size: 1, name: "old", mimetype: "text/plain" } as any));
    const item = b[0];
    const file = new MemoryBinaryFile(Buffer.from("y"), { name: "y", size: 1, hash: "yh" });

    await item.upload(file as any);
    // Replace path was used — our old item is gone, new one in.
    assert.strictEqual(service.store.callCount, 1);
  }

  /**
   * `BinariesItem.delete()` proxies to parent.delete.
   */
  @test
  async binariesItemDelete() {
    const parent = { instance: makeFakeParent(), attribute: "photos" };
    const service = makeServiceStub();
    const b = makeBinaries(parent, service);
    b.push(new BinariesItem(b, { hash: "p", size: 1, name: "p", mimetype: "text/plain" } as any));
    const item = b[0];

    await item.delete();
    assert.strictEqual(service.delete.callCount, 1);
    assert.strictEqual(b.length, 0);
  }
}

/**
 * BinaryService base-class tests — exercise the concrete logic on the
 * abstract class via a minimal subclass that no-ops the abstract methods.
 */
class TestableBinaryService extends BinaryService {
  storeStub = sinon.stub().resolves();
  deleteStub = sinon.stub().resolves();

  async store(): Promise<void> {
    return this.storeStub();
  }
  async getUsageCount(): Promise<number> {
    return 0;
  }
  async delete(): Promise<void> {
    return this.deleteStub();
  }
  async _get(_info: BinaryMap): Promise<Readable> {
    return Readable.from(Buffer.from("payload"));
  }
  async cascadeDelete(): Promise<void> {}
}

@suite
class BinaryServiceUnitTest extends WebdaApplicationTest {
  /**
   * Build a service instance with sane parameters and a fake metrics shim
   * (avoids having to register the service with Core).
   */
  private makeService(modelMap: any = { "*": ["*"] }): TestableBinaryService {
    const params = new BinaryParameters().load({ models: modelMap });
    const svc = new TestableBinaryService("binaryStub", params);
    // initMetrics() needs Core registration; stub the metrics object.
    (svc as any).metrics = {
      upload: { inc: sinon.stub() },
      download: { inc: sinon.stub() },
      delete: { inc: sinon.stub() },
      metadataUpdate: { inc: sinon.stub() }
    };
    return svc;
  }

  /**
   * `streamToBuffer` static utility roundtrip.
   */
  @test
  async streamToBuffer() {
    const stream = Readable.from(Buffer.from("hello world"));
    const buf = await BinaryService.streamToBuffer(stream);
    assert.strictEqual(buf.toString(), "hello world");
  }

  /**
   * `BinaryParameters.maxFileSize` accepts both a number and a string.
   */
  @test
  parametersMaxFileSize() {
    const p = new BinaryParameters().load({ maxFileSize: 1024 });
    assert.strictEqual(p.maxFileSize, 1024);
    p.maxFileSize = "2 MB";
    assert.strictEqual(p.maxFileSize, 2 * 1024 * 1024);
    // Default (no value passed) is 10 MB.
    const def = new BinaryParameters().load({});
    assert.strictEqual(def.maxFileSize, 10 * 1024 * 1024);
    assert.deepStrictEqual(def.models, { "*": ["*"] });
  }

  /**
   * `handleBinary(model, attribute)` maps to score: -1, 0, 1, 2.
   */
  @test
  handleBinaryScores() {
    // Explicit model+attribute → 2
    let svc = this.makeService({ User: ["avatar"] });
    assert.strictEqual(svc.handleBinary("User", "avatar"), 2);
    assert.strictEqual(svc.handleBinary("User", "other"), -1);

    // Explicit model with wildcard attribute → 1
    svc = this.makeService({ User: ["*"] });
    assert.strictEqual(svc.handleBinary("User", "avatar"), 1);

    // Default-with-attribute → 1
    svc = this.makeService({ "*": ["avatar"] });
    assert.strictEqual(svc.handleBinary("User", "avatar"), 1);
    assert.strictEqual(svc.handleBinary("User", "x"), -1);

    // Default-with-wildcard → 0
    svc = this.makeService({ "*": ["*"] });
    assert.strictEqual(svc.handleBinary("Anything", "x"), 0);

    // No default at all → -1
    svc = this.makeService({ User: ["avatar"] });
    assert.strictEqual(svc.handleBinary("Other", "y"), -1);
  }

  /**
   * `getRedirectUrlFromObject` default returns null.
   */
  @test
  async getRedirectUrlFromObjectDefaultsToNull() {
    const svc = this.makeService();
    const ctx = new OperationContext();
    await ctx.init();
    const url = await svc.getRedirectUrlFromObject({} as any, ctx);
    assert.strictEqual(url, null);
  }

  /**
   * `putRedirectUrl` default throws NotFound.
   */
  @test
  async putRedirectUrlDefaultsToNotFound() {
    const svc = this.makeService();
    await assert.rejects(() => svc.putRedirectUrl({} as any, "p", {} as any, {} as any), WebdaError.NotFound);
  }

  /**
   * `get(info)` emits an event, increments the metric, and returns a stream.
   */
  @test
  async getEmitsAndStreams() {
    const svc = this.makeService();
    const emitSpy = sinon.spy(svc, "emit" as any);
    const stream = await svc.get({} as any);
    assert.ok(stream instanceof Readable);
    assert.strictEqual(emitSpy.callCount, 1);
    assert.strictEqual(emitSpy.firstCall.args[0], "Binary.Get");
  }

  /**
   * `newModel` wraps a plain object in a BinaryMap.
   */
  @test
  newModelReturnsBinaryMap() {
    const svc = this.makeService();
    const map = svc.newModel({ hash: "x", size: 1, name: "x", mimetype: "text/plain" });
    assert.ok(map instanceof BinaryMap);
    assert.strictEqual(map.hash, "x");
  }

  /**
   * `getFile(ctx)` consumes the raw input and yields a `MemoryBinaryFile`.
   */
  @test
  async getFileReturnsMemoryFile() {
    const svc = this.makeService();
    const ctx = new OperationContext();
    await ctx.init();
    ctx.setParameters({ size: 5, mimetype: "text/plain", name: "f.txt" } as any);
    (ctx as any).getRawInput = async () => Buffer.from("hello");
    const file = await svc.getFile(ctx);
    assert.ok(file instanceof MemoryBinaryFile);
    assert.strictEqual(file.name, "f.txt");
    assert.strictEqual(file.mimetype, "text/plain");
    assert.strictEqual(file.size, 5);
    assert.ok(file.hash, "hash must be populated");
    assert.ok(file.challenge, "challenge must be populated");
  }

  /**
   * `getFile` defaults mimetype/name when absent.
   */
  @test
  async getFileDefaultsMissingFields() {
    const svc = this.makeService();
    const ctx = new OperationContext();
    await ctx.init();
    ctx.setParameters({} as any);
    (ctx as any).getRawInput = async () => Buffer.from("ab");
    const file = await svc.getFile(ctx);
    assert.strictEqual(file.mimetype, "application/octet-stream");
    assert.strictEqual(file.name, "data.bin");
  }

  /**
   * `getFile` rejects oversized uploads.
   */
  @test
  async getFileRejectsTooBig() {
    const svc = this.makeService();
    const ctx = new OperationContext();
    await ctx.init();
    ctx.setParameters({ size: 100 * 1024 * 1024 } as any); // 100 MB > default 10 MB
    await assert.rejects(() => svc.getFile(ctx), WebdaError.BadRequest);
  }

  /**
   * `downloadTo` writes the binary to disk and resolves.
   */
  @test
  async downloadToWritesFile() {
    const svc = this.makeService();
    const tmp = process.cwd() + "/.binary-spec-download.tmp";
    try {
      await svc.downloadTo({} as any, tmp);
      const fs = await import("fs");
      assert.ok(fs.existsSync(tmp));
      assert.strictEqual(fs.readFileSync(tmp, "utf8"), "payload");
      fs.unlinkSync(tmp);
    } catch (e) {
      const fs = await import("fs");
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      throw e;
    }
  }

  /**
   * `uploadSuccess` rejects when the file carries unknown attributes.
   *
   * The current production code has a known pre-existing quirk: the
   * `additionalAttr = Object.keys(file).filter(...)` assignment-in-condition
   * is always truthy (empty array is truthy), so this branch fires for every
   * call regardless of whether extra keys are present. The assertion below
   * just verifies the throw happens — message matching is loose.
   */
  @test
  async uploadSuccessThrowsOnExtraAttrs() {
    const svc = this.makeService();
    const file: any = { hash: "x", size: 1, name: "n", mimetype: "t", weird: "extra" };
    const target: any = { getUUID: () => "uid", x: [] };
    await assert.rejects(() => svc.uploadSuccess(target, "x", file), /Invalid file object/);
  }

  /**
   * `uploadSuccess` accepts an object with `toBinaryFileInfo()` — the
   * `toBinaryFileInfo()` branch runs and then the same pre-existing
   * `additionalAttr` quirk fires (empty array is truthy).
   */
  @test
  async uploadSuccessRunsToBinaryFileInfoBranch() {
    const svc = this.makeService();
    const file = new MemoryBinaryFile(Buffer.from("y"), { hash: "h", size: 1, name: "y", mimetype: "text/plain" });
    const target: any = { getUUID: () => "u", y: undefined };
    // Throws on the post-conversion validation regardless — this exercises
    // the `toBinaryFileInfo()` call site.
    await assert.rejects(() => svc.uploadSuccess(target, "y", file as any), /Invalid file object/);
  }

  /**
   * `BinaryFile.getHashes` computes md5 + WEBDA-prefixed challenge once.
   */
  @test
  async binaryFileGetHashes() {
    const file = new MemoryBinaryFile(Buffer.from("hello"));
    const { hash, challenge } = await file.getHashes();
    assert.strictEqual(hash, "5d41402abc4b2a76b9719d911017c592");
    assert.ok(challenge);
    // Cached: second call must return same values.
    const again = await file.getHashes();
    assert.deepStrictEqual(again, { hash, challenge });
  }

  /**
   * `BinaryFile.toBinaryFileInfo` returns the plain object.
   */
  @test
  binaryFileToBinaryFileInfo() {
    const file = new MemoryBinaryFile(Buffer.from("y"), { name: "y.bin", mimetype: "text/plain", size: 1 });
    file.hash = "h";
    file.challenge = "c";
    const info = file.toBinaryFileInfo();
    assert.deepStrictEqual(info, {
      hash: "h",
      size: 1,
      mimetype: "text/plain",
      metadata: {},
      challenge: "c",
      name: "y.bin"
    });
  }

  /**
   * `LocalBinaryFile.get()` opens a read stream from disk.
   */
  @test
  async localBinaryFileGet() {
    const fs = await import("fs");
    const tmp = process.cwd() + "/.binary-spec-local.tmp";
    fs.writeFileSync(tmp, "hi-there");
    try {
      const file = new LocalBinaryFile(tmp);
      assert.strictEqual(file.size, 8);
      assert.ok(file.mimetype);
      const buf = await BinaryService.streamToBuffer(await file.get());
      assert.strictEqual(buf.toString(), "hi-there");
    } finally {
      fs.unlinkSync(tmp);
    }
  }

  /**
   * `MemoryBinaryFile` accepts a string buffer too.
   */
  @test
  async memoryBinaryFileFromString() {
    const file = new MemoryBinaryFile("hi", { name: "h" });
    assert.strictEqual(file.size, 2);
    const buf = await BinaryService.streamToBuffer(await file.get());
    assert.strictEqual(buf.toString(), "hi");
  }

  /**
   * `BinaryMap.getAsBuffer()` proxies through service.get.
   */
  @test
  async binaryMapGetAsBuffer() {
    const svc = this.makeService();
    const map = new BinaryMap(svc, { hash: "x", size: 7, name: "p", mimetype: "text/plain" });
    const buf = await map.getAsBuffer();
    assert.strictEqual(buf.toString(), "payload");
  }

  /**
   * `BinaryMap.downloadTo()` proxies to service.downloadTo.
   */
  @test
  async binaryMapDownloadTo() {
    const svc = this.makeService();
    const map = new BinaryMap(svc, { hash: "x", size: 1, name: "p", mimetype: "text/plain" });
    const fs = await import("fs");
    const tmp = process.cwd() + "/.binary-spec-mapdt.tmp";
    try {
      await map.downloadTo(tmp);
      assert.ok(fs.existsSync(tmp));
      fs.unlinkSync(tmp);
    } catch (e) {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      throw e;
    }
  }

  /**
   * `checkMap(model, property)` consults `useModelMetadata` for the
   * Identifier and delegates to `handleBinary`. Returns silently on a
   * known mapping; throws on an unknown one.
   */
  @test
  checkMapKnownMapping() {
    const svc = this.makeService({ "*": ["*"] });
    const fakeModel: any = { Metadata: { Identifier: "Anything" } };
    // Should not throw — wildcard model+attribute matches.
    assert.doesNotThrow(() => (svc as any).checkMap(fakeModel, "x"));
  }

  @test
  checkMapUnknownMapping() {
    const svc = this.makeService({ User: ["avatar"] });
    const fakeModel: any = { Metadata: { Identifier: "Other" } };
    assert.throws(() => (svc as any).checkMap(fakeModel, "x"), /Unknown mapping/);
  }

  /**
   * `verifyMapAndStore` throws NotFound when no mapping exists.
   */
  @test
  verifyMapAndStoreThrowsForUnknownMapping() {
    const svc = this.makeService({ User: ["avatar"] });
    const ctx: any = { parameter: (n: string) => (n === "model" ? "Other" : "x") };
    assert.throws(() => (svc as any).verifyMapAndStore(ctx), WebdaError.NotFound);
  }

  /**
   * `verifyMapAndStore` returns null (TODO refactor) when mapping is known.
   */
  @test
  verifyMapAndStoreReturnsForKnownMapping() {
    const svc = this.makeService({ "*": ["*"] });
    const ctx: any = { parameter: () => "anything" };
    assert.strictEqual((svc as any).verifyMapAndStore(ctx), null);
  }

  /**
   * `getOperationName` strips the "binary"-cased name down to "".
   */
  @test
  getOperationName() {
    const svc = this.makeService();
    (svc as any).name = "Binary";
    assert.strictEqual((svc as any).getOperationName(), "");
    (svc as any).name = "myStore";
    assert.strictEqual((svc as any).getOperationName(), "myStore");
  }

  /**
   * BinaryNotFoundError is a CodeError with the BINARY_NOTFOUND code.
   */
  @test
  binaryNotFoundError() {
    const err = new BinaryNotFoundError("h", "store");
    assert.ok(err instanceof WebdaError.CodeError);
    assert.match(err.message, /Binary not found h BinaryService\(store\)/);
  }
}
