import { suite, test } from "@webda/test";
import * as assert from "assert";
import { inspect } from "node:util";
import { WebdaApplicationTest } from "../test/application.js";
import { TestApplication } from "../test/objects.js";
import { SealedNote } from "../test/sealed-fixture.model.js";
import { registerUserResolver } from "../core/hooks.js";
import { HttpError } from "../errors/errors.js";
import { SealedFormatError, SealedKeyMissingError } from "../errors/sealed.js";
import { fieldAad, generateUserKeyPair, openValue, sealValue, type SealedEnvelope } from "../sealed/index.js";
import { WEBDA_PRIMARY_KEY } from "@webda/models";
import { SealedField } from "./sealed.model.js";

const MODEL = "WebdaTest/SealedNote";
const VALUE = { title: "plain-title", body: "plain-body" };

type TestKey = Awaited<ReturnType<typeof generateUserKeyPair>>;

/**
 * @param field - sealed field
 * @returns its complete envelope
 */
const envelopeOf = (field: SealedField): SealedEnvelope => field.toJSON() as SealedEnvelope;

@suite
class SealedFieldTest extends WebdaApplicationTest {
  /** Users known to the stub resolver, by id */
  users: Record<string, any> = {};
  alice: TestKey;
  bob: TestKey;

  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: { NoteStore: { type: "Webda/MemoryStore", models: [MODEL] } }
    };
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.addModel(MODEL, SealedNote, {
      Identifier: MODEL,
      Ancestors: [],
      Subclasses: [],
      Relations: {},
      PrimaryKey: ["uuid"],
      Events: [],
      Schemas: {},
      Actions: {},
      Import: "",
      Plural: "SealedNotes",
      Reflection: {}
    } as any);
    SealedNote.registerSerializer(true, MODEL);
  }

  async beforeEach() {
    await super.beforeEach();
    this.alice = await generateUserKeyPair();
    this.bob = await generateUserKeyPair();
    const user = (key: TestKey) => ({ keys: { getActivePublicKey: () => ({ kid: key.kid, jwk: key.publicJwk }) } });
    this.users = {
      alice: user(this.alice),
      bob: user(this.bob),
      nokeys: {},
      nokey: { keys: { getActivePublicKey: () => undefined } },
      badkey: {
        keys: { getActivePublicKey: () => ({ kid: "bad", jwk: { kty: "EC", crv: "P-256", x: "AA", y: "AA" } }) }
      }
    };
    registerUserResolver({ resolve: async (id: string) => this.users[id] });
  }

  async afterEach() {
    registerUserResolver(undefined);
  }

  /**
   * @param owner - owner user id
   * @returns a note owned by `owner`
   */
  note(owner?: string): SealedNote {
    const note = new SealedNote();
    if (owner) note.setOwner(owner);
    return note;
  }

  /**
   * Open as the client would
   * @param env - envelope
   * @param key - recipient key pair
   * @param uuid - record uuid
   * @param field - field name
   * @returns the plaintext
   */
  open(env: SealedEnvelope, key: TestKey, uuid: string, field = "content"): Promise<any> {
    return openValue(
      env,
      { privateKey: key.privateKey, publicJwk: key.publicJwk },
      fieldAad(MODEL, uuid, field, env.kid)
    );
  }

  @test
  async sealStoresEnvelopeOnly() {
    const note = this.note("alice");
    assert.ok(note.content instanceof SealedField);
    assert.ok(!note.content.isSet());
    await note.content.seal(VALUE);
    assert.ok(note.content.isSet());
    assert.deepStrictEqual(Object.keys(note.content).sort(), ["ct", "epk", "iv", "kid", "v"]);
    const env = envelopeOf(note.content);
    assert.strictEqual(env.v, 1);
    assert.strictEqual(env.kid, this.alice.kid);
    assert.deepStrictEqual(await this.open(env, this.alice, note.uuid), VALUE);
    note.content.clear();
    assert.ok(!note.content.isSet());
    assert.strictEqual(envelopeOf(note.content), undefined);
  }

  @test
  async noPlaintextAfterSeal() {
    const note = this.note("alice");
    await note.content.seal(VALUE);
    const leaks = (text: string) => text.includes("plain-");
    assert.ok(!leaks(inspect(note.content, { depth: 10, showHidden: true })));
    assert.ok(!leaks(JSON.stringify(envelopeOf(note.content))));
    assert.ok(!leaks(JSON.stringify(note)));
    await SealedNote.getRepository().create(note);
    const repository: any = SealedNote.getRepository();
    const raw = [...((repository.repository ?? repository).storage as Map<string, string>).values()].join("\n");
    assert.ok(raw.includes(note.uuid));
    assert.ok(raw.includes(envelopeOf(note.content).ct), raw);
    assert.ok(!leaks(raw), raw);
  }

  @test
  async aadBindsRecordFieldKid() {
    const note = this.note("alice");
    await note.content.seal(VALUE);
    const env = envelopeOf(note.content);
    // Copied to another record or field, or relabelled with another kid: the client refuses it
    const other = this.note("alice");
    other.content = Object.assign(new SealedField(), env) as any;
    await assert.rejects(() => this.open(envelopeOf(other.content), this.alice, other.uuid));
    await assert.rejects(() => this.open(env, this.alice, note.uuid, "review"));
    await assert.rejects(() => this.open({ ...env, kid: "otherkid" }, this.alice, note.uuid));
    assert.deepStrictEqual(await this.open(env, this.alice, note.uuid), VALUE);
  }

  @test
  async recipientOwnerDefault() {
    const note = this.note("bob");
    await note.content.seal(VALUE);
    assert.strictEqual(envelopeOf(note.content).kid, this.bob.kid);
    assert.deepStrictEqual(await this.open(envelopeOf(note.content), this.bob, note.uuid), VALUE);
    await assert.rejects(() => this.open(envelopeOf(note.content), this.alice, note.uuid));
    // The model can choose another recipient per field
    note.reviewer = "alice";
    await note.review.seal("plain-review");
    assert.strictEqual(envelopeOf(note.review).kid, this.alice.kid);
    assert.strictEqual(await this.open(envelopeOf(note.review), this.alice, note.uuid, "review"), "plain-review");
  }

  @test
  async recipientExplicitUser() {
    const note = this.note("alice");
    await note.content.seal(VALUE, { user: "bob" });
    assert.strictEqual(envelopeOf(note.content).kid, this.bob.kid);
    assert.deepStrictEqual(await this.open(envelopeOf(note.content), this.bob, note.uuid), VALUE);
  }

  @test
  async missingKey412() {
    const cases: [SealedNote, string?][] = [
      [this.note()], // no owner
      [this.note("ghost")], // unknown user
      [this.note("nokeys")], // user without keys
      [this.note("nokey")], // no active public key
      [this.note("alice"), "ghost"] // explicit unknown user
    ];
    for (const [note, user] of cases) {
      await assert.rejects(
        () => note.content.seal(VALUE, user ? { user } : undefined),
        (err: any) => err instanceof SealedKeyMissingError && err instanceof HttpError && err.getResponseCode() === 412
      );
      assert.ok(!note.content.isSet());
    }
    // A malformed public key is a format error (400)
    await assert.rejects(
      () => this.note("badkey").content.seal(VALUE),
      (err: any) => err instanceof SealedFormatError && err instanceof HttpError && err.getResponseCode() === 400
    );
  }

  @test
  async serverCannotOpen() {
    const note = this.note("alice");
    await note.content.seal(VALUE);
    for (const name of ["get", "open", "unseal", "decrypt"]) {
      assert.strictEqual((note.content as any)[name], undefined, name);
    }
    // Without a parent record the AAD cannot be built
    await assert.rejects(() => new SealedField().seal(VALUE), /SealedField is not attached to a model/);
  }

  @test
  async primaryKeyRequired() {
    const note = this.note("alice");
    for (const uuid of [undefined, null, ""]) {
      note.uuid = uuid as any;
      await assert.rejects(
        () => note.content.seal(VALUE),
        (err: any) =>
          err instanceof HttpError &&
          err.getResponseCode() === 400 &&
          /Cannot seal before the object has a primary key/.test(err.message)
      );
      assert.ok(!note.content.isSet());
      assert.strictEqual(note.content.toJSON(), undefined);
    }
    // A previous value is left unchanged
    note.uuid = "fixed-uuid";
    await note.content.seal(VALUE);
    const before = envelopeOf(note.content);
    note.uuid = "";
    await assert.rejects(() => note.content.seal({ title: "other", body: "other" }), HttpError);
    assert.deepStrictEqual(envelopeOf(note.content), before);
  }

  @test
  async partialEnvelopeIsKept() {
    const note = this.note("alice");
    await note.content.seal(VALUE);
    const { epk: _epk, ...partial } = envelopeOf(note.content);
    const copy = new SealedNote({ uuid: note.uuid, content: partial } as any);
    assert.ok(copy.content instanceof SealedField);
    assert.ok(!copy.content.isSet());
    // Corrupted data is preserved as-is, not dropped
    assert.deepStrictEqual(copy.content.toJSON(), partial);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(copy)).content, partial);
    for (const field of ["v", "kid", "iv", "ct"]) {
      const { [field]: _removed, ...other } = envelopeOf(note.content) as any;
      assert.ok(!Object.assign(new SealedField(), other).isSet(), field);
    }
    assert.strictEqual(new SealedField().toJSON(), undefined);
  }

  @test
  async hydrateFromRaw() {
    const note = this.note("alice");
    await note.content.seal(VALUE);
    const env = envelopeOf(note.content);
    // An instance built from plain data hydrates the behavior
    const copy = new SealedNote({ uuid: note.uuid, content: env } as any);
    assert.ok(copy.content instanceof SealedField);
    assert.ok(copy.review instanceof SealedField && !copy.review.isSet());
    assert.strictEqual((copy.content as any).parent.instance, copy);
    assert.strictEqual((copy.content as any).parent.attribute, "content");
    assert.deepStrictEqual(envelopeOf(copy.content), env);
    // Loaded from the store
    await SealedNote.getRepository().create(note);
    const loaded = await SealedNote.ref(note.uuid).get();
    assert.ok(loaded.content instanceof SealedField);
    assert.deepStrictEqual(envelopeOf(loaded.content), env);
    assert.deepStrictEqual(await this.open(envelopeOf(loaded.content), this.alice, loaded.uuid), VALUE);
    // The envelope is a public output
    assert.deepStrictEqual((loaded.toDTO() as any).content, env);
  }

  /**
   * Seal as the client would (`KeyVault.seal`)
   * @param key - recipient key pair
   * @param uuid - record uuid
   * @param field - field name
   * @returns the envelope
   */
  clientSeal(key: TestKey, uuid: string, field = "content"): Promise<SealedEnvelope> {
    return sealValue(VALUE, { kid: key.kid, jwk: key.publicJwk }, fieldAad(MODEL, uuid, field, key.kid));
  }

  /**
   * @param instance - fake record
   * @returns a field attached to it as `content`
   */
  attached(instance: any): SealedField {
    // `parent` is a getter set up by the behavior hydration: shadow it on the instance
    return Object.defineProperty(new SealedField(), "parent", { value: { instance, attribute: "content" } });
  }

  @test
  async setStoresClientEnvelope() {
    const note = this.note("alice");
    await SealedNote.getRepository().create(note);
    const env = await this.clientSeal(this.alice, note.uuid);
    await note.content.set(env);
    assert.deepStrictEqual(envelopeOf(note.content), env);
    // Only the field was patched in the store
    const loaded = await SealedNote.ref(note.uuid).get();
    assert.deepStrictEqual(envelopeOf(loaded.content), env);
    assert.deepStrictEqual(await this.open(envelopeOf(loaded.content), this.alice, note.uuid), VALUE);
    // Sealed to another key than the recipient active one
    await assert.rejects(
      async () => note.content.set(await this.clientSeal(this.bob, note.uuid)),
      (err: any) =>
        err instanceof SealedFormatError && /not sealed to the recipient active public key/.test(err.message)
    );
    assert.deepStrictEqual(envelopeOf(note.content), env);
  }

  @test
  async setRejectsMalformedEnvelope() {
    const note = this.note("alice");
    await SealedNote.getRepository().create(note);
    const env = await this.clientSeal(this.alice, note.uuid);
    const cases: [unknown, RegExp][] = [
      [null, /v must be 1/],
      [{ ...env, v: 2 }, /v must be 1/],
      [{ ...env, kid: 1 }, /kid must be a string/],
      [{ ...env, kid: "" }, /kid must be a string/],
      [{ ...env, iv: "AAAA" }, /sealed envelope iv/],
      [{ ...env, ct: "AAAA" }, /sealed envelope ciphertext/],
      [{ ...env, epk: { kty: "EC", crv: "P-256", d: "AA" } }, /private key/]
    ];
    for (const [envelope, message] of cases) {
      await assert.rejects(
        () => note.content.set(envelope as any),
        (err: any) => err instanceof SealedFormatError && message.test(err.message)
      );
      assert.ok(!note.content.isSet());
    }
  }

  @test
  async sealRethrowsOtherErrors() {
    // Not JSON-serialisable: the error is not hidden as a key format error
    await assert.rejects(
      () => this.note("alice").content.seal(1n as any),
      (err: any) => err instanceof TypeError && !(err instanceof SealedFormatError)
    );
  }

  @test
  async recipientWithoutResolver() {
    // A record without getSealedRecipient: its owner is the recipient, then the model must be registered for the AAD
    const owned = { getPrimaryKey: () => "p1", getOwner: () => ({ getPrimaryKey: () => "alice" }) };
    await assert.rejects(() => this.attached(owned).seal(VALUE), /SealedField content: the model is not registered/);
    // Nor resolver nor owner: no recipient
    await assert.rejects(
      () => this.attached({ getPrimaryKey: () => "p1" }).seal(VALUE),
      (err: any) => err instanceof SealedKeyMissingError && /No recipient for sealed field content/.test(err.message)
    );
  }

  @test
  async compositeKeyRequiresEveryPart() {
    const instance = { [WEBDA_PRIMARY_KEY]: ["a", "b"], a: "x", b: "", getPrimaryKey: () => "x_" };
    await assert.rejects(
      () => this.attached(instance).seal(VALUE),
      (err: any) => err instanceof HttpError && /Cannot seal before the object has a primary key/.test(err.message)
    );
  }
}
