import { EventEmitter } from "node:events";
import { Binaries, MemoryBinaryFile, User } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { afterEach, beforeEach, suite, test } from "@webda/test";
import * as assert from "assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { FileBinary, FileBinaryParameters } from "./filebinary.service.js";

const TEST_DIR = path.join(os.tmpdir(), `webda-fs-cascade-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * User holding a collection of binaries
 */
class ImageUser extends User {
  images: Binaries;
}

@suite
class FileBinaryCascadeTest extends WebdaApplicationTest {
  private fileBinary: FileBinary;

  protected tweakApp(app: any) {
    app.addModel("ImageUser", ImageUser, {
      Identifier: "WebdaDemo/ImageUser",
      Ancestors: [],
      Subclasses: [],
      Relations: { behaviors: [{ attribute: "images", behavior: "Webda/BinariesImpl" }] },
      PrimaryKey: ["uuid"],
      Events: [],
      Schemas: {},
      Actions: {},
      Import: "",
      Plural: "ImageUsers",
      Reflection: {}
    });
    return super.tweakApp(app);
  }

  @beforeEach
  async beforeEach() {
    await super.beforeEach();
    fs.mkdirSync(TEST_DIR, { recursive: true });
    this.fileBinary = this.registerService(
      new FileBinary("fsbinary", new FileBinaryParameters().load({ folder: TEST_DIR }))
    ).resolve();
    await this.fileBinary.init();
  }

  @afterEach
  async afterEach() {
    await this.fileBinary.stop();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }

  /**
   * Build a stored ImageUser without going through its repository
   * @param uuid - the model uuid
   * @returns the object
   */
  user(uuid: string): any {
    const object: any = Object.create(ImageUser.prototype);
    Object.assign(object, { uuid, images: [] });
    object.getUUID = () => uuid;
    object.patch = async (data: any) => Object.assign(object, data);
    return object;
  }

  /**
   * Deleting a model removes its binaries, but a hash still used by another model is kept
   */
  @test
  async sharedHashKept() {
    const repo = new EventEmitter() as any;
    const objects = new Map<string, any>();
    repo.get = async (id: string) => objects.get(id);
    repo.delete = async (id: string) => {
      for (const listener of repo.listeners("Delete")) await listener({ object_id: id });
      objects.delete(id);
      for (const listener of repo.listeners("Deleted")) await listener({ object_id: id });
    };
    (this.fileBinary as any).getRepository = () => repo;
    (this.fileBinary as any).hookDelete(ImageUser, ["images"]);

    const file = (data: string, name: string) =>
      new MemoryBinaryFile(Buffer.from(data), { mimetype: "text/plain", size: data.length, name });
    const a = this.user("a");
    const b = this.user("b");
    objects.set("a", a);
    objects.set("b", b);
    await this.fileBinary.store(a, "images", file("one-content", "one.txt"));
    await this.fileBinary.store(a, "images", file("two-content", "two.txt"));
    await this.fileBinary.store(b, "images", file("two-content", "two.txt"));
    const h1 = a.images[0].hash;
    const h2 = a.images[1].hash;
    assert.strictEqual(await this.fileBinary.getUsageCount(h2), 2);

    await repo.delete("a");
    assert.ok(!fs.existsSync(this.fileBinary._getPath(h1)), "unshared binary removed");
    assert.ok(fs.existsSync(this.fileBinary._getPath(h2, "data")), "shared binary kept");
    assert.strictEqual(await this.fileBinary.getUsageCount(h2), 1);

    await repo.delete("b");
    assert.ok(!fs.existsSync(this.fileBinary._getPath(h2)), "last user removed the binary");
  }
}
