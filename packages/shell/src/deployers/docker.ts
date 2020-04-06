import * as fs from "fs";
import * as glob from "glob";
import * as mkdirp from "mkdirp";
import * as path from "path";
import { Deployer, DeployerResources } from "./deployer";

export interface DockerResources extends DeployerResources {
  workers?: string[];
  tag?: string;
  push?: boolean;
  file?: string;
  command?: string;
}

export class Docker extends Deployer<DockerResources> {
  _copied: boolean = false;

  /**
   * Build a Docker image with webda application
   *
   * @param tag to build
   * @param file path of Dockerfile
   * @param command webda command to run
   */
  buildDocker(tag, file, command: string = "serve") {
    var args = [];
    let stdin;
    args.push("build");
    if (tag) {
      args.push("--tag");
      args.push(tag);
    }
    if (file) {
      args.push("--file");
      args.push(file);
      stdin = null;
      args.push(".");
    } else {
      args.push("--file");
      args.push("-");
      args.push(".");
      stdin = this.getDockerfile(command);
    }
    return this.execute("docker " + args.join(" "), stdin);
  }

  /**
   * Create Docker image and push
   */
  async deploy() {
    let { tag, push, file, command } = this.resources;

    await this.buildDocker(tag, file, command);
    if (tag && push) {
      this.execute("docker push " + tag);
    }

    return {
      tag
    };
  }

  /**
   * Copy the full webda-shell in dist/
   *
   * @param files additional files to include
   */
  async copyWebdaShellToDist(files) {
    if (this._copied) {
      return;
    }
    let target = "./dist/webda-shell";
    if (!fs.existsSync("./dist")) {
      fs.mkdirSync("./dist");
    }
    if (!fs.existsSync("./dist/webda-shell")) {
      fs.mkdirSync("./dist/webda-shell");
    }
    let source = process.env["WEBDA_SHELL_DEV"];
    let includes = files || ["lib"];
    includes.forEach(includePath => {
      let fullpath = path.join(process.env["WEBDA_SHELL_DEV"], includePath);
      if (fs.lstatSync(fullpath).isDirectory()) {
        fullpath += "/**";
      }
      glob.sync(fullpath).forEach(file => {
        let rel_path = target + file.substring(source.length);
        let stat = fs.lstatSync(file);
        if (stat.isDirectory()) {
          if (!fs.existsSync(rel_path)) {
            fs.mkdirSync(rel_path);
          }
          return;
        }
        let parent = path.dirname(rel_path);
        if (!fs.existsSync(parent)) {
          mkdirp.sync(parent);
        }
        fs.copyFileSync(file, rel_path);
      });
    });
    this._copied = true;
  }

  /**
   * Return the instruction to add webda-shell in Docker
   *
   * If within development repository it will copy all local files
   * Otherwise just a simple yarn add
   */
  getDockerfileWebdaShell(): string {
    // If version is enforced
    if (process.env.WEBDA_SHELL_DEPLOY_VERSION) {
      return `RUN yarn global add @webda/shell@${process.env["WEBDA_SHELL_DEPLOY_VERSION"]}\n`;
    }

    // If version is set to dev
    if (process.env.WEBDA_SHELL_DEV) {
      let dockerfile = "";
      let includes = ["node_modules", "package.json", "lib", "bin/webda"];
      console.log(
        `Development version of webda-shell (WEBDA_SHELL_DEV=${process.env.WEBDA_SHELL_DEV}), copying itself`
      );
      // Copy webda-shell into build directory
      this.copyWebdaShellToDist(includes);
      includes.forEach(path => {
        let fullpath = "./dist/webda-shell/" + path;
        if (fs.lstatSync(fullpath).isDirectory()) {
          path += "/";
          dockerfile += `RUN mkdir -p /webda/node_modules/@webda/shell/${path}\n`;
        } else if (path.indexOf("/")) {
          let basedir = path.substring(0, path.lastIndexOf("/") + 1);
          dockerfile += `RUN mkdir -p /webda/node_modules/@webda/shell/${basedir}\n`;
        }
        dockerfile += `ADD ${fullpath} /webda/node_modules/@webda/shell/${path}\n`;
      });
      dockerfile += `RUN rm /webda/node_modules/.bin/webda\n`;
      dockerfile += `RUN ln -s /webda/node_modules/@webda/shell/bin/webda /webda/node_modules/.bin/webda\n`;
      return dockerfile;
    }

    // Normal take the same version as local webda-shell
    let tag = require(__dirname + "/../../package.json").version;
    return `RUN yarn global add @webda/shell@${tag}\n`;
  }

  /**
   * Generate a dynamic Dockerfile with webda application
   *
   * @param command to run
   * @param logfile to save output to
   */
  getDockerfile(command, logfile = undefined) {
    var cwd = process.cwd();
    var packageInfo = require(cwd + "/package.json");
    var dockerfile = `
FROM node:lts-alpine
MAINTAINER docker@webda.io
EXPOSE 18080

RUN mkdir -p /webda/deployments
ADD package.json /webda/
WORKDIR /webda
RUN yarn install
`;
    dockerfile += this.getDockerfileWebdaShell();
    // Import webda-shell
    if (!command) {
      command = "serve";
    }
    if (logfile) {
      logfile = " > " + logfile;
    } else {
      logfile = "";
    }
    dockerfile += "ADD webda.config.json /webda/\n";
    dockerfile += "COPY deployments /webda/deployments/\n";
    let includes = packageInfo.files || ["lib"];
    includes.forEach(path => {
      if (fs.lstatSync(cwd + "/" + path).isDirectory()) {
        path += "/";
        dockerfile += `RUN mkdir /webda/${path}\n`;
      }
      dockerfile += `ADD ${path} /webda/${path}\n`;
    });

    let deployment = this.manager.getDeploymentName();
    if (deployment) {
      // Export deployment
      dockerfile +=
        "RUN node_modules/.bin/webda -d " +
        deployment +
        " config webda.config.json\n";
    }
    dockerfile += "RUN rm -rf deployments\n";
    dockerfile += "CMD node_modules/.bin/webda " + command + logfile + "\n";
    return dockerfile;
  }
}
