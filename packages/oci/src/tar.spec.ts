import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { comparePaths, generateTar, paxRecord, type TarEntry, withDirectories } from "./tar.js";

/**
 * Collect a generated archive
 * @param entries - the entries
 * @param mtime - modification time
 * @returns the archive
 */
async function archive(entries: TarEntry[], mtime = 0): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of generateTar(withDirectories(entries), { mtime })) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

@suite
class TarTest {
  @test
  sortAndDirectories() {
    const entries = withDirectories([
      { path: "app/x-y", type: "file", mode: 0o644, content: Buffer.from("1") },
      { path: "/app/x/z.js", type: "file", mode: 0o644, content: Buffer.from("2") },
      { path: "app/b.js", type: "file", mode: 0o755, content: Buffer.from("3") }
    ]);
    assert.deepStrictEqual(
      entries.map(entry => `${entry.type[0]}:${entry.path}`),
      ["d:app", "f:app/b.js", "d:app/x", "f:app/x/z.js", "f:app/x-y"]
    );
    assert.ok(comparePaths("a/b", "a") > 0);
    assert.throws(
      () =>
        withDirectories([
          { path: "a", type: "file", mode: 0o644, content: Buffer.from("") },
          { path: "a/", type: "file", mode: 0o644, content: Buffer.from("") }
        ]),
      /Duplicate/
    );
  }

  @test
  pax() {
    const record = paxRecord("path", "x");
    assert.strictEqual(record.toString(), "9 path=x\n");
    // Length crossing a power of ten
    const long = paxRecord("path", "a".repeat(92));
    assert.strictEqual(long.length, parseInt(long.toString()));
  }

  @test
  async reproducible() {
    const folder = mkdtempSync(join(tmpdir(), "webda-oci-tar-"));
    try {
      writeFileSync(join(folder, "source.txt"), "from disk");
      const longName = `app/${"deep/".repeat(30)}file.js`;
      const entries: TarEntry[] = [
        { path: "app/index.js", type: "file", mode: 0o644, content: Buffer.from("console.log(1)") },
        { path: "app/source.txt", type: "file", mode: 0o644, source: join(folder, "source.txt") },
        { path: longName, type: "file", mode: 0o755, content: Buffer.from("long") }
      ];
      const first = await archive(entries);
      const second = await archive([...entries].reverse());
      assert.ok(first.equals(second), "Same entries give the same archive");
      assert.strictEqual(first.length % 512, 0);
      assert.ok(!first.equals(await archive(entries, 1000)), "The modification time is part of the archive");
      const file = join(folder, "test.tar");
      writeFileSync(file, first);
      const listing = spawnSync("tar", ["-tvf", file], { encoding: "utf8" });
      if (listing.status === 0) {
        assert.ok(listing.stdout.includes("app/index.js"));
        assert.ok(listing.stdout.includes(longName), "Long names use a PAX header");
        const extracted = join(folder, "out");
        spawnSync("mkdir", [extracted]);
        assert.strictEqual(spawnSync("tar", ["-xf", file, "-C", extracted]).status, 0);
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }

  @test
  async changedFile() {
    const folder = mkdtempSync(join(tmpdir(), "webda-oci-tar-"));
    try {
      const path = join(folder, "f");
      writeFileSync(path, "abc");
      const generator = generateTar([{ path: "f", type: "file", mode: 0o644, source: path }]);
      // Header computed with 3 bytes, then the file grows
      await generator.next();
      writeFileSync(path, "abcdef");
      await assert.rejects(async () => {
        for await (const _chunk of generator) {
          // consume
        }
      }, /changed while archiving/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }
}
