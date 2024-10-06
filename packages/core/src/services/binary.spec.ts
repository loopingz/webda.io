import { test } from "@testdeck/mocha";
import * as assert from "assert";
import * as fs from "fs";
import { User, WebContext } from "../index";
import { CoreModel } from "../models/coremodel";
import { Expose } from "../models/expose";
import { TestApplication, WebdaSimpleTest } from "../test";
import { Binaries, Binary, BinaryService, LocalBinaryFile, MemoryBinaryFile } from "./binary";
import { pipeline } from "node:stream/promises";

/**
 * Expose the image user
 */
@Expose()
export class ImageUser extends User {
  images: Binaries;
  profile: Binary;
}

export class TestBinaryService extends BinaryService {
  store(object: CoreModel, property: string, file: any, metadatas: any, index?: number): Promise<any> {
    throw new Error("Method not implemented.");
  }
  getUsageCount(hash: any): Promise<number> {
    throw new Error("Method not implemented.");
  }
  update(object: any, property: any, index: any, file: any, metadatas: any): Promise<void> {
    throw new Error("Method not implemented.");
  }
  delete(object: CoreModel, property: string, index: number): Promise<void> {
    throw new Error("Method not implemented.");
  }
  challenge(hash: string, challenge: string) {
    throw new Error("Method not implemented.");
  }
  _get() {
    return null;
  }

  async cascadeDelete() {}
}

abstract class BinaryTest<T extends BinaryService = BinaryService> extends WebdaSimpleTest {
  abstract getBinary(): Promise<T>;
  binary: T;

  /**
   * Add the ImageUser model to the app
   * @param app
   * @returns
   */
  tweakApp(app: TestApplication): Promise<void> {
    app.addModel("ImageUser", ImageUser);
    // Add the binaries relationship
    app.getRelations("WebdaDemo/ImageUser").binaries = [
      {
        attribute: "images",
        cardinality: "MANY"
      },
      {
        attribute: "profile",
        cardinality: "ONE"
      }
    ];
    return super.tweakApp(app);
  }

  getTestFile(): string {
    return process.cwd() + "/test/Dockerfile.txt";
  }

  async before(init: boolean = true) {
    this.cleanFiles.push("./downloadTo.tmp");
    await super.before(init);
    this.binary = await this.getBinary();
    assert.notStrictEqual(this.binary, undefined);
    await this.binary.__clean();
  }

  @test
  async normal() {
    const user = await ImageUser.create({
      displayName: "My User"
    });
    const data = fs.readFileSync(this.getTestFile());
    // Upload files
    assert.strictEqual(user.images.length, 0);
    assert.strictEqual(user.profile.isEmpty(), true);
    await user.images.upload(new LocalBinaryFile(this.getTestFile()));
    assert.strictEqual(user.images.length, 1);
    assert.strictEqual(user.profile.isEmpty(), true);
    await user.profile.upload(
      new MemoryBinaryFile(data, {
        mimetype: "text/plain",
        size: data.length,
        name: "Dockerfile.txt"
      })
    );
    assert.strictEqual(user.images.length, 1);
    assert.strictEqual(user.profile.isEmpty(), false);

    // Check download to memory
    assert.deepStrictEqual(await user.profile.getAsBuffer(), data);
    assert.deepStrictEqual(await user.images[0].getAsBuffer(), data);

    // Check download to file
    await user.profile.downloadTo("./downloadTo.tmp");
    assert.deepStrictEqual(fs.readFileSync("./downloadTo.tmp"), data);
    fs.unlinkSync("./downloadTo.tmp");
    await user.images[0].downloadTo("./downloadTo.tmp");
    assert.deepStrictEqual(fs.readFileSync("./downloadTo.tmp"), data);

    // Check download to stream
    await pipeline(await user.profile.get(), fs.createWriteStream("./downloadTo.tmp"));
    assert.deepStrictEqual(fs.readFileSync("./downloadTo.tmp"), data);
    fs.unlinkSync("./downloadTo.tmp");
    await pipeline(await user.images[0].get(), fs.createWriteStream("./downloadTo.tmp"));
    assert.deepStrictEqual(fs.readFileSync("./downloadTo.tmp"), data);

    const hash = user.images[0].hash;
    assert.strictEqual(await this.binary.getUsageCount(hash), 2);
    // Check delete
    await user.images[0].delete();
    assert.strictEqual(user.images.length, 0);
    assert.strictEqual(await this.binary.getUsageCount(hash), 1);
    // Verify the profile is still there
    assert.deepStrictEqual(await user.profile.getAsBuffer(), data);
    user.profile.metadata.mydata = "test";
    await user.save();
    await user.profile.delete();
    assert.strictEqual(user.profile.isEmpty(), true);
    assert.strictEqual(await this.binary.getUsageCount(hash), 0);
  }

  @test
  async checkMap() {
    const binary = await this.getBinary();
    binary.handleBinary = () => -1;
    // @ts-ignore
    assert.throws(() => binary.checkMap(new CoreModel(), "pouf"), /Unknown mapping/);
  }

  async setupDefault(withLogin: boolean = true): Promise<{
    binary: BinaryService;
    user1: ImageUser;
    ctx: WebContext;
  }> {
    const binary = await this.getBinary();
    const user1: ImageUser = await ImageUser.create({
      displayName: "plop"
    });
    await binary.store(user1, "images", new LocalBinaryFile(this.getTestFile()));
    await user1.refresh();
    const ctx = await this.newContext();
    if (withLogin) {
      ctx.getSession().login(user1.getUuid(), "fake");
    }
    return { binary, user1, ctx };
  }
}

export { BinaryTest };
