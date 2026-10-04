import { execFileSync } from "node:child_process";
import type { GitInformation } from "../application/iconfiguration.js";

/**
 * Compute the snapshot version used when the current commit is not tagged with the package version
 *
 * The patch is incremented (or the prerelease dropped) and the build metadata is the date
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
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}${pad(date.getMilliseconds(), 3)}`;
  return `${major}.${minor}.${prerelease ? patch : parseInt(patch) + 1}+${stamp}`;
}

/**
 * Retrieve the git information of a repository
 *
 * The `GIT_INFO` environment variable (base64 JSON of {@link GitInformation}) takes precedence,
 * useful when building without the repository (containers). The version is the package version
 * when the current commit has the tag `<packageName>@<version>` or `v<version>`, otherwise a
 * snapshot version from {@link nextSnapshotVersion}.
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
    return {
      commit: git("rev-parse", "HEAD"),
      branch: git("rev-parse", "--abbrev-ref", "HEAD"),
      short: git("rev-parse", "--short", "HEAD"),
      tag,
      tags,
      version: tag ? version : nextSnapshotVersion(version)
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
