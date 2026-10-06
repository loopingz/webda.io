import { suite, test } from "@webda/test";
import * as assert from "assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getGitInformation, nextSnapshotVersion } from "./git.js";

/**
 * Run git in a folder
 * @param cwd - the repository
 * @param args - git arguments
 */
function git(cwd: string, ...args: string[]) {
  execFileSync("git", ["-c", "user.email=test@webda.io", "-c", "user.name=test", ...args], { cwd, stdio: "pipe" });
}

@suite
class GitInformationTest {
  @test
  snapshotVersion() {
    const date = new Date(2026, 9, 4, 13, 5, 7, 9);
    assert.strictEqual(nextSnapshotVersion("1.2.3", date), "1.2.4+20261004130507009");
    assert.strictEqual(nextSnapshotVersion("1.2.3-beta.1", date), "1.2.3+20261004130507009");
    assert.strictEqual(nextSnapshotVersion("", date), "");
  }

  @test
  repository() {
    const dir = mkdtempSync(join(tmpdir(), "webda-git-"));
    try {
      git(dir, "init", "-q", "-b", "main");
      writeFileSync(join(dir, "file.txt"), "content");
      git(dir, "add", "file.txt");
      git(dir, "commit", "-q", "-m", "init");
      const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
      let info = getGitInformation(dir, "mypackage", "1.0.0");
      assert.strictEqual(info.commit, commit);
      assert.strictEqual(info.short, commit.substring(0, info.short.length));
      assert.strictEqual(info.branch, "main");
      assert.strictEqual(info.tag, "");
      assert.deepStrictEqual(info.tags, []);
      assert.match(info.version, /^1\.0\.1\+\d{17}$/);
      // A tag matching the package version keeps the version
      git(dir, "tag", "mypackage@1.0.0");
      info = getGitInformation(dir, "mypackage", "1.0.0");
      assert.strictEqual(info.tag, "mypackage@1.0.0");
      assert.deepStrictEqual(info.tags, ["mypackage@1.0.0"]);
      assert.strictEqual(info.version, "1.0.0");
      git(dir, "tag", "v1.1.0");
      assert.strictEqual(getGitInformation(dir, "other", "1.1.0").tag, "v1.1.0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @test
  noRepository() {
    const dir = mkdtempSync(join(tmpdir(), "webda-nogit-"));
    try {
      const info = getGitInformation(dir, "mypackage", "1.0.0");
      assert.strictEqual(info.commit, "unknown");
      assert.strictEqual(info.branch, "unknown");
      assert.strictEqual(info.version, "1.0.0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @test
  fromEnvironment() {
    const expected = { commit: "c", branch: "b", short: "s", tag: "t", tags: ["t"], version: "1.0.0" };
    process.env.GIT_INFO = Buffer.from(JSON.stringify(expected)).toString("base64");
    try {
      assert.deepStrictEqual(getGitInformation("/nonexistent", "mypackage", "2.0.0"), expected);
    } finally {
      delete process.env.GIT_INFO;
    }
  }
}
