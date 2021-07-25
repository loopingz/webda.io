import { Configuration, JSONUtils, DeployerResources } from "@webda/core";
import * as fs from "fs";
import * as path from "path";
import { Deployer } from "./deployer";
import * as semver from "semver";
import { intersect } from "semver-intersect";
import * as glob from "glob";
import * as crypto from "crypto";

export interface PackagerResources extends DeployerResources {
  zipPath: string;
  entrypoint?: string;
  package?: {
    ignores?: string[];
    excludePatterns?: string[];
    modules?: {
      excludes?: string[];
      includes?: string[];
    };
  };
  includeLinkModules?: boolean;
}
/**
 * Generate a ZIP Package of the application
 *
 * It can add a file as entrypoint
 *
 * @param zipPath path to store the package
 * @param entrypoint file to integrate as entrypoint.js
 */
export default class Packager<T extends PackagerResources> extends Deployer<T> {
  packagesGenerated: { [key: string]: boolean } = {};

  static loadPackageInfo(dir): any {
    return JSONUtils.loadFile(path.join(dir, "package.json"));
  }

  static getWorkspacesPackages(dir: string = ""): string[] {
    if (dir === "") {
      dir = process.cwd();
    }
    let result = this.loadPackageInfo(dir).workspaces || ["packages/*"];
    return result
      .map(r => glob.sync(path.join(dir, r)))
      .flat()
      .map(r => path.relative(dir, r));
  }

  /**
   * Retrieve Yarn workspaces root
   */
  static getWorkspacesRoot(dir: string = ""): string {
    if (dir === "") {
      dir = process.cwd();
    }
    do {
      if (fs.existsSync(path.join(dir, "lerna.json"))) {
        return dir;
      }

      if (fs.existsSync(path.join(dir, "package.json"))) {
        try {
          let pkg = JSONUtils.loadFile(path.join(dir, "package.json"));
          if (pkg.workspaces) {
            return dir;
          }
        } catch (err) {}
      }
      // Does not make sense to go upper than the .git repo
      if (fs.existsSync(path.join(dir, ".git")) || path.resolve(dir) === "/") {
        return undefined;
      }
      dir = path.join(dir, "..");
    } while (fs.existsSync(dir));
    return undefined;
  }

  static getPackageLastChanges(pkg: string, includeWorkspace: boolean = false): string {
    let hash = crypto.createHash("md5");
    if (includeWorkspace) {
      let root = this.getWorkspacesRoot(pkg);
      if (root) {
        this.getWorkspacesPackages(root).forEach(p => {
          if (fs.existsSync(path.join(root, p, "package.json"))) {
            hash.update(this.getPackageLastChanges(path.join(root, p), false));
          }
        });
        return hash.digest("hex");
      }
    }
    let main = Packager.loadPackageInfo(pkg);
    main.files = main.files || [];
    main.files.forEach(p => {
      let includeDir = path.join(pkg, p);
      if (fs.existsSync(includeDir)) {
        glob.sync(includeDir).forEach(src => {
          let stat = fs.lstatSync(src);
          if (stat.isDirectory()) {
            return glob.sync(src + "/**").forEach(f => hash.update(fs.lstatSync(f).mtime + f));
          } else {
            hash.update(stat.mtime + src);
          }
        });
      }
    });
    return hash.digest("hex");
  }

  static getDependencies(pkg: string): { [key: string]: { name: string; version: string }[] } {
    let deps: { [key: string]: any[] } = {};
    let wrk = Packager.getWorkspacesRoot();
    let main = Packager.loadPackageInfo(pkg);
    main.resolutions = main.resolutions || {};
    const browsed = [];
    let browse = (p: string, depth: number) => {
      if (browsed.includes(p)) return;
      browsed.push(p);
      let info = Packager.loadPackageInfo(p);
      info.dependencies = info.dependencies || {};
      Object.keys(info.dependencies).forEach(name => {
        let version = info.dependencies[name];
        if (main.resolutions[name]) {
          version = main.resolutions[name];
        }
        deps[name] = deps[name] || [];
        deps[name].push({ name: p, version });
        // Is there any specific version for this package
        if (fs.existsSync(`${p}/node_modules/${name}`)) {
          browse(`${p}/node_modules/${name}`, depth + 1);
          // Is it in the direct deps
        } else if (fs.existsSync(`node_modules/${name}`)) {
          browse(`node_modules/${name}`, depth + 1);
          // Is there a workspace dep existing
        } else if (wrk && fs.existsSync(`${wrk}/node_modules/${name}`)) {
          browse(`${wrk}/node_modules/${name}`, depth + 1);
        }
      });
    };
    browse(pkg, 0);
    return deps;
  }

  static getResolvedDependencies(pkg: string): { [key: string]: string } {
    const deps = Packager.getDependencies(pkg);
    let resolutions: { [key: string]: string } = {};
    for (let i in deps) {
      if (deps[i].length > 1) {
        try {
          resolutions[i] = intersect(
            ...deps[i].filter(v => semver.validRange(v.version) && v.version !== "*").map(v => v.version)
          );
        } catch (err) {
          console.log("Cannot simplify", i, deps[i]);
        }
      } else {
        resolutions[i] = deps[i][0].version;
      }
    }
    return resolutions;
  }

  async loadDefaults() {
    await super.loadDefaults();
    this.resources.package = this.resources.package || {};
    this.resources.package.ignores = this.resources.package.ignores || [];
    this.resources.package.excludePatterns = this.resources.package.excludePatterns || ["\\.d\\.ts$"];
    this.resources.package.modules = this.resources.package.modules || {};
    this.resources.package.modules.excludes = this.resources.package.modules.excludes || [];
    this.resources.package.modules.includes = this.resources.package.modules.includes || [];
    this.resources.zipPath ??= this.app.getAppPath("/dist/package.zip");

    // Append .zip if not there
    if (!this.resources.zipPath.endsWith(".zip")) {
      this.resources.zipPath += ".zip";
    }
  }

  /**
   * Generate a full code package including dependencies
   */
  async deploy(): Promise<any> {
    let { zipPath, entrypoint } = this.resources;

    if (this.packagesGenerated[zipPath + entrypoint || ""]) {
      return;
    }
    this.app.compile();
    this.app.generateModule();
    this.app.loadModules();

    var archiver = require("archiver");
    let targetDir = path.dirname(zipPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir);
    }
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    var ignores = [
      "dist",
      "bin",
      "test",
      "Dockerfile",
      "README.md",
      "package.json",
      "deployments",
      "app",
      "webda.config.json",
      ...this.resources.package.ignores
    ];
    // Should load the ignore from a file
    var toPacks = [];

    var files;
    let appPath = this.app.getAppPath();
    let packageFile = this.app.getAppPath("/package.json");
    if (fs.existsSync(packageFile)) {
      files = require(packageFile).files;
    }
    files = files || fs.readdirSync(appPath);
    for (let i in files) {
      let name = files[i];
      if (name.startsWith(".")) continue;
      if (ignores.indexOf(name) >= 0) continue;
      toPacks.push(`${appPath}/${name}`);
    }
    if (toPacks.indexOf(`${appPath}/node_modules`) >= 0) {
      toPacks = toPacks.filter(p => p !== `${appPath}/node_modules`);
    }
    // Ensure dependencies
    // Get deps info
    // Include specified modules
    let deps = [...this.resources.package.modules.includes];
    deps.push(...Object.keys(Packager.getDependencies(appPath)));
    // Remove any excludes modules
    this.resources.package.modules.excludes.forEach(i => {
      let id = deps.indexOf(i);
      if (id >= 0) {
        deps.splice(id, 1);
      }
    });

    // Include workspace deps
    let workspace = Packager.getWorkspacesRoot();
    deps.forEach(dep => {
      // Include package dep
      if (fs.existsSync(`${appPath}/node_modules/${dep}`)) {
        toPacks.push(`${appPath}/node_modules/${dep}`);
      } else if (workspace && fs.existsSync(`${workspace}/node_modules/${dep}`)) {
        toPacks.push(`${workspace}/node_modules/${dep}`);
      } else {
        this.logger.log("WARN", "Cannot find package", dep);
      }
    });

    var output = fs.createWriteStream(zipPath);
    var archive = archiver("zip");
    return new Promise<void>((resolve, reject) => {
      output.on("close", () => {
        this.packagesGenerated[zipPath + entrypoint || ""] = true;
        resolve();
      });

      archive.on("error", function (err) {
        console.log(err);
        reject(err);
      });

      // Patch the archiver to allow filtering
      const originalFile = archive._append;
      archive._append = (from, to) => {
        let name = from;
        if (typeof from === "object") {
          name = from.name;
        }
        let exclude = false;
        this.resources.package.excludePatterns.forEach(r => {
          if (exclude || new RegExp(r).exec(from)) {
            exclude = true;
          }
        });
        if (exclude) {
          this.logger.log("INFO", "Skipping ", name);
          return to.callback();
        }
        return originalFile.call(archive, from, to);
      };

      archive.pipe(output);
      for (let i in toPacks) {
        if (!fs.existsSync(toPacks[i])) {
          continue;
        }
        var stat = fs.lstatSync(toPacks[i]);
        let dstPath = path.relative(appPath, toPacks[i]).replace(/\.\.\//g, "");
        if (stat.isSymbolicLink() && this.resources.includeLinkModules) {
          this.addLinkPackage(archive, fs.realpathSync(toPacks[i]), dstPath);
        } else if (stat.isDirectory()) {
          // Add custom recursive function
          archive.directory(toPacks[i], dstPath);
        } else if (stat.isFile()) {
          archive.file(toPacks[i], {
            name: path.relative(appPath, dstPath)
          });
        }
      }
      if (entrypoint) {
        if (fs.existsSync(entrypoint)) {
          archive.file(entrypoint, {
            name: "entrypoint.js"
          });
        } else {
          throw Error("Cannot find the entrypoint for Lambda: " + entrypoint);
        }
      }

      archive.append(JSON.stringify(this.getPackagedConfiguration(), undefined, 2), {
        name: "webda.config.json"
      });
      archive.finalize();
    });
  }

  protected getPackagedConfiguration(): Configuration {
    let config = this.app.getCurrentConfiguration();
    config = this.replaceVariables(config);
    config.cachedModules = this.app.getModules();
    return config;
  }

  /**
   * Add a symbolic linked package from dependency
   *
   * @param archive to add to
   * @param fromPath absolutePath of package
   * @param toPath relative path within archive
   */
  protected addLinkPackage(archive, fromPath: string, toPath: string) {
    let packageFile = fromPath + "/package.json";
    let files;
    if (fs.existsSync(packageFile)) {
      archive.file(`${packageFile}`, { name: `${toPath}/package.json` });
      files = require(packageFile).files;
    }
    files = files || fs.readdirSync(fromPath);
    files.forEach(file => {
      if (file.startsWith(".") || file === "package.json") return;
      var stat = fs.lstatSync(`${fromPath}/${file}`);
      if (stat.isDirectory()) {
        archive.directory(`${fromPath}/${file}`, `${toPath}/${file}`);
      } else if (stat.isFile()) {
        archive.file(`${fromPath}/${file}`, { name: `${toPath}/${file}` });
      }
    });
  }
}

export { Packager };
