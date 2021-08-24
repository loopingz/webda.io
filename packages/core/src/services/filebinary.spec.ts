import { BinaryTest } from "./binary.spec";
import * as assert from "assert";
import { FileBinary } from "./filebinary";
import { suite, test } from "@testdeck/mocha";
import { Binary } from "./binary";

@suite
class FileBinaryTest extends BinaryTest {
  @test
  isValidChallenge() {
    let binary: FileBinary = <FileBinary>this.getService("binary");
    assert.strictEqual(
      binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e8157980"),
      true
    );
    assert.strictEqual(
      binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e815798G"),
      false
    );
    assert.strictEqual(
      binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e815798"),
      false
    );
    assert.strictEqual(
      binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e815798."),
      false
    );
  }

  // Test parent class

  @test
  initMap() {
    let binary = this.getBinary();
    binary.initMap(undefined);
    binary.initMap({ _init: true });
    // Bad store
    binary.initMap({
      VersionService: {},
      None: {},
      MemoryIdents: "idents"
    });
  }

  @test
  _getFile() {
    let binary = this.getBinary();
    const files = [{}];
    assert.strictEqual(binary._getFile({ files }), files[0]);
    const req = {
      body: "plop",
      headers: {
        contentType: "text/plain"
      }
    };
    assert.deepStrictEqual(binary._getFile(req), {
      buffer: "plop",
      mimetype: "text/plain",
      originalname: "",
      size: 4
    });
  }
}

export { FileBinaryTest };
