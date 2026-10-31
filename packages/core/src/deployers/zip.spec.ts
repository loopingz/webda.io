import { suite, test } from "@webda/test";
import * as assert from "assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readZip } from "../../test/unzip.js";
import { crc32, writeZip } from "./zip.js";

@suite
class ZipTest {
  dir: string;

  beforeEach() {
    this.dir = mkdtempSync(join(tmpdir(), "webda-zip-"));
  }

  afterEach() {
    rmSync(this.dir, { recursive: true, force: true });
  }

  @test
  crc() {
    assert.strictEqual(crc32(Buffer.from("123456789")), 0xcbf43926);
    assert.strictEqual(crc32(Buffer.alloc(0)), 0);
  }

  @test
  writeAndRead() {
    const source = join(this.dir, "source.txt");
    writeFileSync(source, "a".repeat(1000));
    const random = randomBytes(256);
    const zipPath = join(this.dir, "out/archive.zip");
    const size = writeZip(zipPath, [
      { target: "lib/source.txt", source, mode: 0o755 },
      { target: "generated.json", content: '{"ok":true}' },
      { target: "random.bin", content: random },
      { target: "empty", content: "" },
      { target: "dossier/é.txt", content: "utf8" }
    ]);
    assert.strictEqual(size, readFileSync(zipPath).length);
    const entries = readZip(zipPath);
    assert.deepStrictEqual(
      entries.map(e => e.name),
      ["lib/source.txt", "generated.json", "random.bin", "empty", "dossier/é.txt"]
    );
    // Compressible content is deflated, random content is stored
    assert.strictEqual(entries[0].method, 8);
    assert.strictEqual(entries[2].method, 0);
    assert.strictEqual(entries[0].data.toString(), "a".repeat(1000));
    assert.strictEqual(entries[1].data.toString(), '{"ok":true}');
    assert.ok(entries[2].data.equals(random));
    assert.strictEqual(entries[3].data.length, 0);
    assert.strictEqual(entries[4].data.toString(), "utf8");
    entries.forEach(entry => assert.strictEqual(entry.crc, crc32(entry.data)));
    // Unix mode, regular file by default
    assert.strictEqual(entries[0].mode, 0o100755);
    assert.strictEqual(entries[1].mode, 0o100644);
  }

  @test
  deterministic() {
    const entries = [
      { target: "a.txt", content: "A" },
      { target: "b.txt", content: "B".repeat(100) }
    ];
    writeZip(join(this.dir, "1.zip"), entries);
    writeZip(join(this.dir, "2.zip"), entries);
    assert.ok(readFileSync(join(this.dir, "1.zip")).equals(readFileSync(join(this.dir, "2.zip"))));
  }

  @test
  readableByUnzip() {
    const zipPath = join(this.dir, "check.zip");
    writeZip(zipPath, [
      { target: "folder/file.txt", content: "hello ".repeat(50) },
      { target: "other.txt", content: "world" }
    ]);
    let listing: string;
    try {
      listing = execFileSync("unzip", ["-Z1", zipPath]).toString();
    } catch {
      // unzip is not installed
      return;
    }
    assert.deepStrictEqual(listing.trim().split("\n"), ["folder/file.txt", "other.txt"]);
    execFileSync("unzip", ["-tq", zipPath]);
  }

  @test
  tooManyEntries() {
    const entries = Array.from({ length: 0x10000 }, (_, i) => ({ target: `${i}`, content: "" }));
    assert.throws(() => writeZip(join(this.dir, "big.zip"), entries), /Too many files for a zip archive: 65536/);
  }
}
