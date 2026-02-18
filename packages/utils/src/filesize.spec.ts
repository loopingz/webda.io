import { suite, test } from "@webda/test";
import { FileSize } from "./filesize";
import * as assert from "assert";

@suite
export class FileSizeTest {
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

  @test
  testToString() {
    // Test small values (< 100) - shows 2 decimals
    assert.strictEqual(new FileSize(99).toString(), "99.00 B");
    assert.strictEqual(new FileSize(1024).toString(), "1.00 KB");
    assert.strictEqual(new FileSize(1536).toString(), "1.50 KB");

    // Test large values (>= 100) - shows 0 decimals
    assert.strictEqual(new FileSize(512).toString(), "512 B");
    assert.strictEqual(new FileSize(1024 * 100).toString(), "100 KB");
    assert.strictEqual(new FileSize(1024 * 1024).toString(), "1.00 MB");
    assert.strictEqual(new FileSize(1024 * 1024 * 100).toString(), "100 MB");
    assert.strictEqual(new FileSize(1024 * 1024 * 1024).toString(), "1.00 GB");
    assert.strictEqual(new FileSize(1024 ** 4).toString(), "1.00 TB");
    assert.strictEqual(new FileSize(1024 ** 5).toString(), "1.00 PB");
  }

  @test
  testSymbolToPrimitive() {
    const size = new FileSize(1024);

    // Test string hint
    assert.strictEqual(String(size), "1.00 KB");
    assert.strictEqual(`${size}`, "1.00 KB");

    // Test number hint
    assert.strictEqual(Number(size), 1024);
    assert.strictEqual(+size, 1024);

    // Test default hint (number)
    assert.strictEqual(size + 0, 1024);
  }

  @test
  testDecimalValues() {
    assert.strictEqual(+new FileSize("1.5 KB"), 1536);
    assert.strictEqual(+new FileSize("2.5 MB"), Math.round(2.5 * 1024 * 1024));
    assert.strictEqual(+new FileSize("0.5 GB"), Math.round(0.5 * 1024 ** 3));
  }

  @test
  testNoUnit() {
    // Test string number without unit (defaults to bytes)
    assert.strictEqual(+new FileSize("1024"), 1024);
    assert.strictEqual(+new FileSize("512"), 512);
    assert.strictEqual(new FileSize("1024").toString(), "1.00 KB");
    assert.strictEqual(new FileSize("100").toString(), "100 B");
  }

  @test
  testEdgeCases() {
    // Zero bytes
    assert.strictEqual(new FileSize(0).toString(), "0.00 B");

    // 1 byte
    assert.strictEqual(new FileSize(1).toString(), "1.00 B");

    // Just under threshold for next unit (>= 100 so 0 decimals)
    assert.strictEqual(new FileSize(1023).toString(), "1023 B");

    // Just over threshold
    assert.strictEqual(new FileSize(1025).toString(), "1.00 KB");
  }
}
