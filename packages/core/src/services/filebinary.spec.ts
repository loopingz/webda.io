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
}

export { FileBinaryTest };
