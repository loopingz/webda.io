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
  execFileSync("git", ["-c", "user.email=test@webda.io", "-c", "user.name=test", ...args], {
    cwd,
    stdio: "pipe",
    // Fixed commit date: the snapshot version is derived from it
    env: { ...process.env, GIT_COMMITTER_DATE: "2026-10-04T13:05:07Z", GIT_AUTHOR_DATE: "2026-10-04T13:05:07Z" }
  });
}

/**
 * Create a repository with one commit
 * @returns the repository folder
 */
function repository(): string {
  const dir = mkdtempSync(join(tmpdir(), "webda-git-"));
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "file.txt"), "content");
  git(dir, "add", "file.txt");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

@suite
class GitInformationTest {
  @test
  snapshotVersion() {
    const date = new Date(Date.UTC(2026, 9, 4, 13, 5, 7, 9));
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
      // The snapshot is dated by the commit, in UTC: the same commit always gives the same version
      assert.strictEqual(info.version, "1.0.1+20261004130507000");
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

  @test
  sourceDateEpoch() {
    const dir = repository();
    process.env.SOURCE_DATE_EPOCH = "86400";
    try {
      assert.strictEqual(getGitInformation(dir, "mypackage", "1.0.0").version, "1.0.1+19700102000000000");
    } finally {
      delete process.env.SOURCE_DATE_EPOCH;
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @test
  dirtyWorkingTree() {
    const dir = repository();
    try {
      const clean = getGitInformation(dir, "mypackage", "1.0.0").version;
      writeFileSync(join(dir, "file.txt"), "changed");
      const changed = getGitInformation(dir, "mypackage", "1.0.0").version;
      assert.match(changed, /^1\.0\.1\+20261004130507000\.dirty\.[0-9a-f]{8}$/);
      // Same uncommitted content, same version
      assert.strictEqual(getGitInformation(dir, "mypackage", "1.0.0").version, changed);
      // Other content, other version
      writeFileSync(join(dir, "file.txt"), "changed again");
      const other = getGitInformation(dir, "mypackage", "1.0.0").version;
      assert.notStrictEqual(other, changed);
      // Untracked files count too
      writeFileSync(join(dir, "new.txt"), "new");
      assert.notStrictEqual(getGitInformation(dir, "mypackage", "1.0.0").version, other);
      // Ignored files do not
      writeFileSync(join(dir, ".gitignore"), "ignored.txt\n");
      const withIgnore = getGitInformation(dir, "mypackage", "1.0.0").version;
      writeFileSync(join(dir, "ignored.txt"), "ignored");
      assert.strictEqual(getGitInformation(dir, "mypackage", "1.0.0").version, withIgnore);
      // A tagged release with local changes is not the release
      git(dir, "tag", "mypackage@1.0.0");
      assert.match(getGitInformation(dir, "mypackage", "1.0.0").version, /^1\.0\.0\+dirty\.[0-9a-f]{8}$/);
      // Back to the committed content
      git(dir, "checkout", "-q", "--", "file.txt");
      rmSync(join(dir, "new.txt"));
      rmSync(join(dir, ".gitignore"));
      rmSync(join(dir, "ignored.txt"));
      git(dir, "tag", "-d", "mypackage@1.0.0");
      assert.strictEqual(getGitInformation(dir, "mypackage", "1.0.0").version, clean);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
