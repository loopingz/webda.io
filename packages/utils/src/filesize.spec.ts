import { suite, test } from "@webda/test";
import { FileSize } from "./filesize";
import * as assert from "assert";

@suite
class FileSizeTest {
  @test
  normal() {
    // This is a test
    assert.strictEqual(+new FileSize(1024), 1024);
    assert.strictEqual(+new FileSize("1 KB"), 1024);
    assert.strictEqual(+new FileSize("1 MB"), 1024 * 1024);
    assert.strictEqual(+new FileSize("1 GB"), 1024 * 1024 * 1024);
    assert.strictEqual(+new FileSize("1 TB"), 1024 ** 4);
    assert.strictEqual(+new FileSize("1 PB"), 1024 ** 5);
    assert.strictEqual(+new FileSize("1 ko"), 1024);
    assert.strictEqual(+new FileSize("1 mo"), 1024 * 1024);
    assert.strictEqual(+new FileSize("1 gO"), 1024 * 1024 * 1024);
    assert.strictEqual(+new FileSize("1 TO"), 1024 ** 4);
    assert.strictEqual(512 + +new FileSize("1 PO"), 512 + 1024 ** 5);
    assert.throws(() => new FileSize("invalid"));
    assert.ok(new FileSize("1 KB").valueOf() > 512);
  }
}
