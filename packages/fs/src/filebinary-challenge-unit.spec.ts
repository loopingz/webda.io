import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  Binaries,
  Binary,
  BinaryMap,
  MemoryBinaryFile,
  MemoryRepository,
  registerRepository,
  User,
  WebContext,
  WebdaError
} from "@webda/core";
import { TestApplication, WebdaApplicationTest } from "@webda/core/lib/test";
import { useApplication } from "@webda/core";
import { JSONUtils } from "@webda/utils";
import { FileBinary } from "./filebinary.service.js";

/**
 * A user with binary attributes
 */
class ImageUser extends User {
  images: Binaries;
  profile: Binary;
}

const FOLDER = path.join(os.tmpdir(), `webda-fs-challenge-${process.pid}`);

/**
 * The challenge/upload protocol of FileBinary: a binary is attached to an object only once its content is proven,
 * by a matching challenge (proof of possession of an existing binary) or by the upload itself
 */
@suite
class FileBinaryChallengeTest extends WebdaApplicationTest {
  binary: FileBinary;

  getTestConfiguration() {
    return {
      services: {
        // Declared first: the CryptoService keys live in the Registry, which must be initialized before it
        Registry: { type: "Webda/MemoryStore" },
        CryptoService: { type: "Webda/CryptoService", autoCreate: true }
      }
    };
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.addModel("WebdaDemo/ImageUser", ImageUser, {
      Identifier: "WebdaDemo/ImageUser",
      Ancestors: [],
      Subclasses: [],
      Relations: {
        behaviors: [
          { attribute: "images", behavior: "Webda/BinariesImpl" },
          { attribute: "profile", behavior: "Webda/Binary" }
        ]
      },
      PrimaryKey: ["uuid"],
      Events: [],
      Schemas: {},
      Actions: {},
      Import: "",
      Plural: "ImageUsers",
      Reflection: {}
    } as any);
    ImageUser.registerSerializer(true, "WebdaDemo/ImageUser");
  }

  async beforeAll(init: boolean = true) {
    await super.beforeAll(init);
    // The service under test comes from the sources, not from the compiled module
    this.binary = await this.addService(
      FileBinary,
      { folder: FOLDER, url: "/binary/", models: { "*": ["*"] } },
      "binary"
    );
  }

  async beforeEach() {
    await super.beforeEach();
    fs.rmSync(FOLDER, { recursive: true, force: true });
    fs.mkdirSync(FOLDER, { recursive: true });
    registerRepository(ImageUser as any, new MemoryRepository(ImageUser as any, ["uuid"]) as any);
  }

  async afterEach() {
    fs.rmSync(FOLDER, { recursive: true, force: true });
    await super.afterEach();
  }

  /**
   * @param content - the binary content
   * @returns its hash and challenge
   */
  hashes(content: string): Promise<{ hash: string; challenge: string }> {
    return new MemoryBinaryFile(Buffer.from(content)).getHashes();
  }

  /**
   * @param uuid - the object uuid
   * @returns the stored images
   */
  async images(uuid: string): Promise<any[]> {
    return ((await ImageUser.ref(uuid).get()) as any).images ?? [];
  }

  /**
   * Store a binary on a user the way the server does
   * @param content - the content
   * @returns the user and the hash
   */
  async storedFor(content: string): Promise<{ user: ImageUser; hash: string }> {
    const user = await ImageUser.create({ displayName: "victim" } as any);
    await this.binary.store(user, "images", new MemoryBinaryFile(Buffer.from(content), { name: "v.txt" }));
    return { user, hash: (await this.hashes(content)).hash };
  }

  @test
  async challengeAttachesOnlyProvenContent() {
    const { hash } = await this.storedFor("the victim's private file");
    const attacker = await ImageUser.create({ displayName: "attacker" } as any);
    const ctx = await this.newContext();
    // The hash is visible to anyone who can read the owner; a made-up challenge proves nothing
    const info: any = { hash, challenge: "not-the-challenge", size: 25, name: "mine.txt", mimetype: "text/plain" };
    const res = await this.binary.putRedirectUrl(attacker, "images", info, ctx);
    assert.ok(res?.url, "the content has to be uploaded");
    assert.deepStrictEqual(await this.images(attacker.getUUID()), [], "nothing attached without proof");
    assert.strictEqual(await this.binary.getUsageCount(hash), 1);
    // The real challenge (md5 of "WEBDA" + content) proves possession: attached, no upload needed
    const { challenge } = await this.hashes("the victim's private file");
    const done = await this.binary.putRedirectUrl(attacker, "images", { ...info, challenge }, ctx);
    assert.strictEqual(done, undefined);
    const images = await this.images(attacker.getUUID());
    assert.strictEqual(images.length, 1);
    assert.strictEqual(images[0].hash, hash);
    assert.strictEqual(images[0].name, "mine.txt");
    assert.strictEqual(await this.binary.getUsageCount(hash), 2);
  }

  /**
   * The challenge is the proof of possession: it is never sent to clients nor persisted on the object, so a reader
   * of the owner's object cannot copy `{hash, challenge}` to attach the binary
   */
  @test
  async challengeIsNeverVisibleToReaders() {
    const { user, hash } = await this.storedFor("the victim's private file");
    const stored: any = await ImageUser.ref(user.getUUID()).get();
    assert.strictEqual(stored.images[0].challenge, undefined, "not persisted");
    for (const output of [
      JSON.parse(JSON.stringify(stored)),
      JSON.parse(JSONUtils.stringify(stored, undefined, 0, true))
    ]) {
      assert.strictEqual(output.images[0].hash, hash);
      assert.strictEqual(output.images[0].challenge, undefined, "not output");
      assert.ok(!JSON.stringify(output).includes("challenge"));
    }
    // Copying what a reader sees does not attach
    const attacker = await ImageUser.create({ displayName: "attacker" } as any);
    const copied: any = JSON.parse(JSONUtils.stringify(stored, undefined, 0, true)).images[0];
    const res = await this.binary.putRedirectUrl(attacker, "images", copied, await this.newContext());
    assert.ok(res?.url);
    assert.deepStrictEqual(await this.images(attacker.getUUID()), []);
  }

  /**
   * Maps persisted before the fix carry a challenge: it is dropped on load, absent from the schema, and the legacy
   * `_<challenge>` markers are no proof any more (the holder uploads once; a leaked value attaches nothing)
   */
  @test
  async legacyChallengesAreNeitherLoadedNorProofs() {
    const { user, hash } = await this.storedFor("legacy content");
    const { challenge } = await this.hashes("legacy content");
    // A pre-fix row: the challenge persisted on the map, the legacy `_<challenge>` marker in the folder (no proof_)
    await ImageUser.ref(user.getUUID()).patch({
      images: [{ hash, challenge, size: 14, name: "l.txt", mimetype: "text/plain" }]
    } as any);
    fs.unlinkSync(this.binary._getPath(hash, `proof_${challenge}`));
    this.binary._touch(this.binary._getPath(hash, `_${challenge}`));
    assert.strictEqual(await this.binary.getUsageCount(hash), 1, "legacy markers do not count as usages");
    const loaded: any = await ImageUser.ref(user.getUUID()).get();
    // Hydrated the way a compiled model does it: the stored info goes through BinaryMap.set (BinariesItem, Binary)
    const map = new BinaryMap(this.binary, loaded.images[0]);
    assert.strictEqual(map.challenge, undefined, "dropped on load");
    assert.strictEqual(map.hash, hash);
    assert.ok(!JSON.stringify(map).includes(challenge));
    assert.ok(!JSON.stringify(map).includes("challenge"));
    // The single-binary behavior too
    const single = new Binary();
    single.set({ hash, challenge, size: 14, name: "l.txt", mimetype: "text/plain" } as any);
    assert.strictEqual(single.challenge, undefined);
    assert.ok(!JSON.stringify(single).includes("challenge"));
    // The generated schema of the binary information carries no challenge
    const schema: any = useApplication().getSchema("Webda/BinaryFile");
    assert.ok(schema, "schema exists");
    assert.strictEqual(schema.properties?.challenge, undefined);
    assert.ok(!(schema.required ?? []).includes("challenge"));
    // A leaked legacy challenge attaches nothing: the legacy marker is not a proof
    const attacker = await ImageUser.create({ displayName: "attacker" } as any);
    const res = await this.binary.putRedirectUrl(
      attacker,
      "images",
      { hash, challenge, size: 14, name: "l.txt", mimetype: "text/plain" } as any,
      await this.newContext()
    );
    assert.ok(res?.url, "an upload is required");
    assert.deepStrictEqual(await this.images(attacker.getUUID()), []);
    // Once uploaded again (post-fix proof), the holder dedupes
    const upload = await this.newContext("legacy content");
    upload.setParameters({ hash, token: res.url.split("token=")[1] });
    await this.binary.storeBinary(upload);
    assert.strictEqual((await this.images(attacker.getUUID())).length, 1);
    const holder = await ImageUser.create({ displayName: "holder" } as any);
    assert.strictEqual(
      await this.binary.putRedirectUrl(
        holder,
        "images",
        { hash, challenge, size: 14, name: "h.txt", mimetype: "text/plain" } as any,
        await this.newContext()
      ),
      undefined
    );
    assert.strictEqual(await this.binary.getUsageCount(hash), 3);
  }

  /**
   * Usage marker names come from the model id, attribute and key: a key with path segments stays in the hash folder
   */
  @test
  async usageMarkersStayInTheHashFolder() {
    const user = await ImageUser.create({ uuid: "../../escape", displayName: "evil" } as any);
    const content = "marker content";
    await this.binary.store(user, "images", new MemoryBinaryFile(Buffer.from(content), { name: "m.txt" }));
    const { hash } = await this.hashes(content);
    const folder = this.binary._getPath(hash);
    const files = fs.readdirSync(folder);
    assert.strictEqual(files.length, 3, files.join(","));
    assert.ok(
      files.every(f => !f.includes("/")),
      files.join(",")
    );
    assert.ok(!fs.existsSync(path.join(FOLDER, "escape")) && !fs.existsSync(path.join(FOLDER, "..", "escape")));
    assert.strictEqual(await this.binary.getUsageCount(hash), 1);
    // And cleanup finds them
    await this.binary.delete(user as any, "images", 0);
    assert.strictEqual(await this.binary.getUsageCount(hash), 0);
  }

  @test
  async uploadAttachesAfterTheContentIsStored() {
    const user = await ImageUser.create({ displayName: "uploader" } as any);
    const ctx = await this.newContext();
    const content = `fresh content ${Date.now()}`;
    const { hash, challenge } = await this.hashes(content);
    const info: any = { hash, challenge, size: content.length, name: "fresh.txt", mimetype: "text/plain" };
    const res = await this.binary.putRedirectUrl(user, "images", info, ctx);
    assert.ok(res?.url);
    assert.deepStrictEqual(await this.images(user.getUUID()), [], "nothing attached before the upload");
    const token = res.url.split("token=")[1];
    // Other content under the same token: refused, nothing attached
    const wrong = await this.newContext("other content");
    wrong.setParameters({ hash, token });
    await assert.rejects(
      () => this.binary.storeBinary(wrong),
      (err: WebdaError.HttpError) => err.getResponseCode() === 400
    );
    assert.deepStrictEqual(await this.images(user.getUUID()), []);
    // The announced content: stored and attached with the announced info
    const upload = await this.newContext(content);
    upload.setParameters({ hash, token });
    await this.binary.storeBinary(upload);
    const images = await this.images(user.getUUID());
    assert.strictEqual(images.length, 1);
    assert.strictEqual(images[0].hash, hash);
    assert.strictEqual(images[0].name, "fresh.txt");
    assert.strictEqual(fs.readFileSync(this.binary._getPath(hash, "data")).toString(), content);
    assert.strictEqual(await this.binary.getUsageCount(hash), 1);
    // A second upload with the same token attaches nothing twice
    const again = await this.newContext(content);
    again.setParameters({ hash, token });
    await this.binary.storeBinary(again);
    assert.strictEqual((await this.images(user.getUUID())).length, 1);
    // A second challenge with the proof is done at once
    assert.strictEqual(await this.binary.putRedirectUrl(user, "images", info, ctx), undefined);
  }

  @test
  async downloadTokensAreNotUploadTokens() {
    const { hash } = await this.storedFor("downloadable");
    // An upload token does not download
    const putToken = await this.binary.getToken(hash, "PUT");
    const download: WebContext = await this.newContext();
    download.setParameters({ hash, token: putToken });
    await assert.rejects(() => this.binary.downloadBinaryLink(download), WebdaError.Forbidden);
    // A download token does not upload
    const getToken = await this.binary.getToken(hash, "GET");
    const upload = await this.newContext("downloadable");
    upload.setParameters({ hash, token: getToken });
    await assert.rejects(() => this.binary.storeBinary(upload), WebdaError.Forbidden);
    // A download token downloads
    const ok: WebContext = await this.newContext();
    ok.setParameters({ hash, token: getToken });
    await this.binary.downloadBinaryLink(ok);
    assert.strictEqual(ok.statusCode, 200);
  }
}
