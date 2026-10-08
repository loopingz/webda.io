import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  Binaries,
  Binary,
  MemoryBinaryFile,
  MemoryRepository,
  registerRepository,
  User,
  WebContext,
  WebdaError
} from "@webda/core";
import { TestApplication, WebdaApplicationTest } from "@webda/core/lib/test";
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
