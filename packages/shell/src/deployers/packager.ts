import { Configuration } from "@webda/core";
import * as fs from "fs";
import * as path from "path";
import { Deployer, DeployerResources } from "./deployer";

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

  async loadDefaults() {
    await super.loadDefaults();
    this.resources.package = this.resources.package || {};
    this.resources.package.ignores = this.resources.package.ignores || [];
    this.resources.package.excludePatterns = this.resources.package.excludePatterns || ["\\.d\\.ts$"];
    this.resources.package.modules = this.resources.package.modules || {};
    this.resources.package.modules.excludes = this.resources.package.modules.excludes || [];
    this.resources.package.modules.includes = this.resources.package.modules.includes || [];
  }

  /**
   * Generate a full code package including dependencies
   */
  async deploy(): Promise<any> {
    let { zipPath, entrypoint } = this.resources;

    if (!zipPath) {
      zipPath = this.app.getAppPath("/dist/package.zip");
    }

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
      var name = files[i];
      if (name.startsWith(".")) continue;
      if (ignores.indexOf(name) >= 0) continue;
      toPacks.push(`${appPath}/${name}`);
    }
    // Ensure dependencies
    // Get deps info
    if (toPacks.indexOf(`${appPath}/node_modules`) < 0) {
      // Include specified modules
      let filters = [...this.resources.package.modules.includes];
      try {
        let info = await this.execute("NODE_ENV=production yarn list --json 2>/dev/null", undefined, true);
        const recDep = info => {
          info.forEach(dep => {
            filters.push(dep.name.replace(/@\d+\.\d+\.\d+.*/, ""));
            if (info.children && info.children.length) {
              recDep(info.children);
            }
          });
        };
        let parsedInfo = JSON.parse(info.output);
        recDep(parsedInfo.data.trees);
      } catch (err) {
        filters = [];
        this.logger.log("INFO", ":error", err);
      }

      // Remove any excludes modules
      this.resources.package.modules.excludes.forEach(i => {
        let id = filters.indexOf(i);
        if (id >= 0) {
          filters.splice(id, 1);
        }
      });
      if (fs.existsSync(`${appPath}/node_modules`)) {
        let files = fs.readdirSync(`${appPath}/node_modules`);
        files.forEach(file => {
          if (file.startsWith("@")) {
            // If namespace then check if package are linked
            fs.readdirSync(`${appPath}/node_modules/${file}`).forEach(p => {
              if (filters.length && filters.indexOf(`${file}/${p}`) < 0) {
                return;
              }
              toPacks.push(`${appPath}/node_modules/${file}/${p}`);
            });
          } else {
            if (filters.length && filters.indexOf(file) < 0) {
              return;
            }
            toPacks.push(`${appPath}/node_modules/${file}`);
          }
        });
      }
    }
    var output = fs.createWriteStream(zipPath);
    var archive = archiver("zip");

    var p = new Promise((resolve, reject) => {
      output.on("finish", () => {
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
          return;
        }
        return originalFile.call(archive, from, to);
      };

      archive.pipe(output);
      for (let i in toPacks) {
        if (!fs.existsSync(toPacks[i])) {
          continue;
        }
        var stat = fs.lstatSync(toPacks[i]);
        if (stat.isSymbolicLink()) {
          this.addLinkPackage(archive, fs.realpathSync(toPacks[i]), path.relative(appPath, toPacks[i]));
        } else if (stat.isDirectory()) {
          // Add custom recursive function
          archive.directory(toPacks[i], path.relative(appPath, toPacks[i]));
        } else if (stat.isFile()) {
          archive.file(toPacks[i], {
            name: path.relative(appPath, path.relative(appPath, toPacks[i]))
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
    return p;
  }

  protected getPackagedConfiguration(): Configuration {
    let config = this.app.getCurrentConfiguration();
    config = this.objectParameter(config);
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
