import { DeleteObjectsCommandInput, HeadObjectCommand, ListObjectsV2Command, S3 } from "@aws-sdk/client-s3";
import { BinaryService, MemoryBinaryFile, User } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mockClient } from "aws-sdk-client-mock";
import { localstackParams, WebdaAwsTest } from "../../test/fixture.js";
import { S3Binary, S3BinaryParameters } from "./s3binary.service.js";

const Bucket = "webda-test";

@suite
class S3BinaryTest extends WebdaAwsTest {
  binary: S3Binary;

  async beforeAll() {
    await super.beforeAll();
    // The application sets createConfiguration on the compiled classes only: the source class
    // would inherit the one of BinaryService and lose the S3 parameters
    S3Binary.createConfiguration = (params: any) =>
      params instanceof S3BinaryParameters ? params : new S3BinaryParameters().load(params);
  }

  async beforeEach() {
    await super.beforeEach();
    await this.install();
    await this.cleanData();
    this.binary = this.registerService(
      new S3Binary(
        "binary",
        new S3BinaryParameters().load({
          ...localstackParams,
          bucket: Bucket,
          forcePathStyle: true
        })
      )
    ).resolve();
    await this.binary.init();
  }

  getS3() {
    return new S3({ ...localstackParams, forcePathStyle: true });
  }

  async cleanData() {
    const s3 = this.getS3();
    // For test we do not have more than 1k objects
    const data = await s3.listObjectsV2({ Bucket });
    const params: DeleteObjectsCommandInput = {
      Bucket,
      Delete: {
        Objects: (data.Contents ?? []).map(c => ({ Key: c.Key }))
      }
    };
    if (params.Delete.Objects.length === 0) {
      return;
    }
    await s3.deleteObjects(params);
  }

  async install() {
    const s3 = this.getS3();
    try {
      await s3.headBucket({ Bucket });
    } catch (err) {
      if (err.name === "NotFound") {
        await s3.createBucket({ Bucket });
      } else {
        throw err;
      }
    }
  }

  @test
  async storeAndGet() {
    const user = await User.ref("s3user").create({} as any);
    const file = new MemoryBinaryFile(Buffer.from("plop"), { name: "plop.txt", mimetype: "text/plain" });
    await this.binary.store(user, "images", file);
    assert.strictEqual((user as any).images.hash, file.hash);
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 1);
    assert.ok(await this.binary._exists(file.hash));
    assert.strictEqual(
      (await BinaryService.streamToBuffer(await this.binary._get((user as any).images))).toString(),
      "plop"
    );
    // Storing again only add the usage marker
    const user2 = await User.ref("s3user2").create({} as any);
    await this.binary.store(user2, "images", new MemoryBinaryFile(Buffer.from("plop"), { name: "plop.txt" }));
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 2);
    // Signed url to download
    const url = await this.binary.getRedirectUrlFromObject((user as any).images, undefined, 30);
    assert.ok(url.includes(`/${Bucket}/${file.hash}/data?`), url);
    // Delete the usage
    await this.binary.delete(user2 as any, "images");
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 1);
    // Cascade delete remove everything
    await this.binary.cascadeDelete({ hash: file.hash } as any, user.getUUID());
    assert.ok(!(await this.binary._exists(file.hash)));
    assert.strictEqual(await this.binary.getUsageCount(file.hash), 0);
  }

  @test
  async putRedirectUrl() {
    const user = await User.ref("s3redirect").create({} as any);
    const file = new MemoryBinaryFile(Buffer.from("redirect"), { name: "r.txt" });
    await file.getHashes();
    const info = file.toBinaryFileInfo();
    // Nothing uploaded yet: get a signed PUT url
    let res = await this.binary.putRedirectUrl(user, "images", info);
    assert.strictEqual(res.method, "PUT");
    assert.ok(res.url.includes(`/${Bucket}/${file.hash}/data?`));
    assert.strictEqual(res.headers["Content-MD5"], Buffer.from(file.hash, "hex").toString("base64"));
    assert.strictEqual((user as any).images.hash, file.hash);
    // Marker exists but no data yet: still need to upload
    res = await this.binary.putRedirectUrl(user, "images", info);
    assert.strictEqual(res.method, "PUT");
    // Data is there with the right challenge: no upload needed
    await this.binary.putObject(this.binary._getKey(file.hash), "redirect");
    const user2 = await User.ref("s3redirect2").create({} as any);
    res = await this.binary.putRedirectUrl(user2, "images", info);
    assert.strictEqual(res, undefined);
    assert.strictEqual((user2 as any).images.hash, file.hash);
    // Marker and data exist
    assert.strictEqual(await this.binary.putRedirectUrl(user2, "images", info), undefined);
  }

  @test
  async getARN() {
    const policies = this.binary.getARNPolicy("plop");
    assert.strictEqual(policies.Resource[0], "arn:aws:s3:::webda-test");
    assert.strictEqual(policies.Resource[1], "arn:aws:s3:::webda-test/*");
    assert.deepStrictEqual(this.binary.getCloudFormation({ getDefaultTags: tags => tags ?? [] }), {
      binaryBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "webda-test",
          Tags: []
        }
      }
    });
    this.binary.getParameters().CloudFormationSkip = true;
    assert.deepStrictEqual(this.binary.getCloudFormation(undefined), {});
  }

  @test
  async forEachFile() {
    let keys = [];
    let calls = 0;
    const mock = mockClient(S3);
    mock.on(ListObjectsV2Command).callsFake(async p => {
      if (calls++ % 2 === 0) {
        return {
          Contents: [
            { Key: "test/test.txt" },
            { Key: "test/test.json" },
            { Key: "test2/test.txt" },
            { Key: "loop.txt" }
          ].filter(i => {
            return i.Key.startsWith(p.Prefix);
          }),
          NextContinuationToken: "2"
        };
      }
      return { Contents: [] };
    });
    try {
      await this.binary.forEachFile(
        "myBucket",
        async (Key: string) => {
          keys.push(Key);
        },
        undefined,
        /.*\.txt/
      );
      assert.deepStrictEqual(keys, ["test/test.txt", "test2/test.txt", "loop.txt"]);
      keys = [];
      await this.binary.forEachFile(
        "myBucket",
        async (Key: string) => {
          keys.push(Key);
        },
        "test/"
      );
      assert.deepStrictEqual(keys, ["test/test.txt", "test/test.json"]);
    } finally {
      mock.restore();
    }
  }

  @test
  params() {
    assert.throws(() => new S3BinaryParameters().load({}), /Need to define a bucket at least/);
  }

  @test
  async signedUrl() {
    const urls = [
      this.binary.getSignedUrl("plop/test", "putObject", {
        Bucket: "myBuck"
      }),
      this.binary.getSignedUrl("plop/test")
    ];
    (await Promise.all(urls)).forEach(url => {
      assert.ok(
        url.match(/http:\/\/localhost:\d+\/(myBuck|webda-test)\/plop\/test\?.*Signature=.*/),
        `'${url}' does not match expected`
      );
    });
  }

  @test
  async exists() {
    assert.ok(!(await this.binary._exists("bouzouf")));
    await this.binary.putObject(this.binary._getKey("bouzouf"), "plop");
    assert.ok(await this.binary._exists("bouzouf"));
    assert.strictEqual(
      (await BinaryService.streamToBuffer(await this.binary.getObject(this.binary._getKey("bouzouf")))).toString(
        "utf8"
      ),
      "plop"
    );
    assert.notStrictEqual(await this.binary.exists(this.binary._getKey("bouzouf")), null);
    assert.strictEqual(await this.binary.exists(this.binary._getKey("bouzouf2")), null);
  }

  @test
  async cleanHash() {
    for (let i = 0; i < 7; i++) {
      await this.binary.putObject(this.binary._getKey("bouzouf", `marker${i}`), "plop");
    }
    await this.binary._cleanHash("bouzouf");
    const data = await this.getS3().listObjectsV2({ Bucket, Prefix: "bouzouf/" });
    assert.strictEqual(data.Contents?.length ?? 0, 0);
  }

  @test
  getKey() {
    let key = this.binary._getKey("bouzouf", "two");
    assert.strictEqual(key, "bouzouf/two");
    this.binary.getParameters().prefix = "plop";
    key = this.binary._getKey("bouzouf", "two");
    assert.strictEqual(key, "plop/bouzouf/two");
  }

  @test
  async cascadeDelete() {
    const original = this.binary._s3.deleteObject;
    this.binary._s3.deleteObject = () => {
      throw new Error();
    };
    try {
      // Errors are logged, not thrown
      await this.binary.cascadeDelete({ hash: "pp" } as any, "pp");
    } finally {
      this.binary._s3.deleteObject = original;
    }
  }

  @test
  async badErrors() {
    const mock = mockClient(S3);
    mock.on(HeadObjectCommand).rejects(new Error("Fake"));
    try {
      await assert.rejects(() => this.binary._getS3("plop"));
      await assert.rejects(() => this.binary._exists("plop"));
      await assert.rejects(() => this.binary.exists("plop"));
    } finally {
      mock.restore();
    }
  }
}
