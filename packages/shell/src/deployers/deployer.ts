import { Application, Core, _extend } from "@webda/core";
import * as fs from "fs";
import * as path from "path";

//import { AWSDeployer } from "./aws";
export class Deployer {
  _step: number;
  _maxStep: number;
  resources: any;
  parameters: any;
  deployment: any;
  app: Application;
  _webda: Core;

  constructor(
    app: Application,
    webda: Core,
    deployment = undefined,
    unitParameters = undefined
  ) {
    this._webda = webda; // Used once to get swagger definition
    this._step = 1;
    this.parameters = {};
    this.resources = {};
    this.deployment = deployment;
    this.app = app;
    if (this.deployment) {
      _extend(this.resources, deployment.resources);
    }
    if (unitParameters) {
      _extend(this.resources, unitParameters);
    }
  }

  static getDeployers(folder: string, deploymentName: string) {
    // Load Core
    let app = new Application(folder);
    app.compile();
    app.setCurrentDeployment(deploymentName);
    let deployment = app.getDeployment(deploymentName);
    let webdaCore = new Core(app);
    let deployersDefinition: any = webdaCore.getDeployers();
    deployersDefinition["webdadeployer/aws"] = require("./aws").default; //AWSDeployer;
    let deployersMap = {};
    deployment.units.forEach(d => {
      if (!deployersDefinition[d.type.toLowerCase()]) {
        webdaCore.log("CONSOLE", "Cannot find deployer", d.type);
      } else {
        deployersMap[d.name] = new deployersDefinition[d.type.toLowerCase()](
          app,
          webdaCore
        ); // Load deployer
      }
    });
    return deployersMap;
  }

  static getDeployer(folder: string, deployment: string, name: string) {
    let deployers = Deployer.getDeployers(folder, deployment);
    if (!deployers[name]) {
      throw new Error("Unknown deployer");
    }
    return deployers[name];
  }

  stepper(msg) {
    console.log("[" + this._step++ + "/" + this._maxStep + "] " + msg);
  }

  async generateCodePackage(zipPath: string, entrypoint: string = undefined) {
    this.app.compile();
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
      "webda.config.json"
    ];
    if (this.resources.package && this.resources.package.ignores) {
      ignores = ignores.concat(this.resources.package.ignores);
    }
    // Should load the ignore from a file
    var toPacks = [];

    var files;
    let appPath = this._webda.getAppPath();
    let packageFile = appPath + "/package.json";
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
    if (toPacks.indexOf(`${appPath}/node_modules`) < 0) {
      if (fs.existsSync(`${appPath}/node_modules`)) {
        let files = fs.readdirSync(`${appPath}/node_modules`);
        files.forEach(file => {
          toPacks.push(`${appPath}/node_modules/${file}`);
        });
      }
    }
    var output = fs.createWriteStream(zipPath);
    var archive = archiver("zip");

    var p = new Promise((resolve, reject) => {
      output.on("finish", () => {
        resolve();
      });

      archive.on("error", function(err) {
        console.log(err);
        reject(err);
      });

      archive.pipe(output);
      for (let i in toPacks) {
        if (!fs.existsSync(toPacks[i])) {
          continue;
        }
        var stat = fs.lstatSync(toPacks[i]);
        if (stat.isSymbolicLink()) {
          this.addLinkPackage(archive, fs.realpathSync(toPacks[i]), toPacks[i]);
        } else if (stat.isDirectory()) {
          archive.directory(toPacks[i], path.relative(appPath, toPacks[i]));
        } else if (stat.isFile()) {
          archive.file(toPacks[i], {
            name: path.relative(appPath, toPacks[i])
          });
        }
      }
      if (entrypoint) {
        if (fs.existsSync(entrypoint)) {
          archive.file(entrypoint, {
            name: "entrypoint.js"
          });
        } else {
          throw Error("Cannot find the entrypoint for Lambda");
        }
      }
      archive.append(
        JSON.stringify(this._webda.getConfiguration(), undefined, 2),
        {
          name: "webda.config.json"
        }
      );
      archive.finalize();
    });
    return p;
  }

  addLinkPackage(archive, fromPath, toPath) {
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

  async generateDockerImage() {
    // Read from docker-mixin
  }

  async deploy(args) {}

  async undeploy(args) {}

  getServices() {
    return this._webda.getServicesImplementations();
  }
}
