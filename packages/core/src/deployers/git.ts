import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import type { GitInformation } from "../application/iconfiguration.js";

/**
 * Compute the snapshot version used when the current commit is not tagged with the package version
 *
 * The patch is incremented (or the prerelease dropped) and the build metadata is the UTC date
 * as `yyyymmddHHMMssl`: `1.2.3` becomes `1.2.4+20261004130507009`
 *
 * @param version - the package version
 * @param date - the snapshot date
 * @returns the snapshot version, or the version unchanged if it is not semver
 */
export function nextSnapshotVersion(version: string, date: Date = new Date()): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(-[^+]+)?/.exec(version ?? "");
  if (!match) {
    return version;
  }
  const [, major, minor, patch, prerelease] = match;
  const pad = (value: number, length: number = 2) => value.toString().padStart(length, "0");
  const stamp =
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}` +
    pad(date.getUTCMilliseconds(), 3);
  return `${major}.${minor}.${prerelease ? patch : parseInt(patch) + 1}+${stamp}`;
}

/**
 * Hash the uncommitted changes of a repository: tracked changes against HEAD and untracked files
 * that are not ignored
 *
 * @param root - the repository root
 * @returns the first 8 hex characters of the hash, undefined when the working tree is clean
 */
function uncommittedHash(root: string): string | undefined {
  const run = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe", maxBuffer: 1024 ** 3 });
  // Fixed diff format: the user configuration (colors, prefixes, renames) must not change the hash
  const diff = run(
    "diff",
    "HEAD",
    "--binary",
    "--no-color",
    "--no-ext-diff",
    "--no-renames",
    "--src-prefix=a/",
    "--dst-prefix=b/"
  );
  const untracked = run("ls-files", "--others", "--exclude-standard", "-z")
    .toString()
    .split("\0")
    .filter(file => file !== "")
    .sort();
  if (!diff.length && !untracked.length) {
    return undefined;
  }
  const hash = createHash("sha256").update(diff);
  for (const file of untracked) {
    const path = join(root, file);
    hash.update(`\0${file}\0`);
    hash.update(lstatSync(path).isSymbolicLink() ? readlinkSync(path) : readFileSync(path));
  }
  return hash.digest("hex").substring(0, 8);
}

/**
 * Retrieve the git information of a repository
 *
 * The `GIT_INFO` environment variable (base64 JSON of {@link GitInformation}) takes precedence,
 * useful when building without the repository (containers). The version is the package version
 * when the current commit has the tag `<packageName>@<version>` or `v<version>`, otherwise a
 * snapshot version from {@link nextSnapshotVersion} dated by `SOURCE_DATE_EPOCH` or the commit.
 * Uncommitted changes add `dirty.<hash of the changes>` to the build metadata, so the same sources
 * always give the same version.
 *
 * @param cwd - a folder within the repository
 * @param packageName - the package name, to find the version tag
 * @param version - the package version
 * @returns the git information, with `unknown` commit and branch outside of a repository
 */
export function getGitInformation(cwd: string, packageName: string = "", version: string = ""): GitInformation {
  if (process.env.GIT_INFO) {
    return JSON.parse(Buffer.from(process.env.GIT_INFO, "base64").toString());
  }
  const git = (...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
  try {
    const tags = git("tag", "--points-at", "HEAD")
      .split("\n")
      .filter(tag => tag !== "");
    const tag = [`${packageName}@${version}`, `v${version}`].find(candidate => tags.includes(candidate)) ?? "";
    const epoch = process.env.SOURCE_DATE_EPOCH ?? git("log", "-1", "--format=%ct");
    let gitVersion = tag ? version : nextSnapshotVersion(version, new Date(parseInt(epoch) * 1000));
    const dirty = gitVersion ? uncommittedHash(git("rev-parse", "--show-toplevel")) : undefined;
    if (dirty) {
      gitVersion += `${gitVersion.includes("+") ? "." : "+"}dirty.${dirty}`;
    }
    return {
      commit: git("rev-parse", "HEAD"),
      branch: git("rev-parse", "--abbrev-ref", "HEAD"),
      short: git("rev-parse", "--short", "HEAD"),
      tag,
      tags,
      version: gitVersion
    };
  } catch {
    return {
      commit: "unknown",
      branch: "unknown",
      short: "00000000",
      tag: "",
      tags: [],
      version
    };
  }
}
