const spawn = require("child_process").spawn;
import { Deployer } from "./deployer";
import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";
import * as mkdirp from "mkdirp";

type Constructor<T extends Deployer> = new (...args: any[]) => T;

function DockerMixIn<T extends Constructor<Deployer>>(Base: T) {
  return class extends Base {
    _sentContext: boolean;
    _copied: boolean = false;

    buildDocker(tag, file, stdin) {
      var args = [];
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
      }

      console.log("docker " + args.join(" "));
      return this.execute(
        "docker",
        args,
        this.out.bind(this),
        this.out.bind(this),
        stdin
      );
    }

    execute(script, args = [], onout, onerr, stdin = undefined) {
      return new Promise((resolve, reject) => {
        var ls = spawn(script, args);

        ls.stdout.on("data", data => {
          if (onout) {
            onout(data);
          }
        });

        ls.stderr.on("data", data => {
          if (onerr) {
            onerr(data);
          }
        });

        ls.on("close", code => {
          if (code == 0) {
            resolve(code);
          } else {
            reject(code);
          }
        });
        if (stdin) {
          ls.stdin.write(stdin);
          ls.stdin.end();
        }
      });
    }

    out(data) {
      data = data.toString();
      if (data.startsWith("Sending build context to Docker daemon")) {
        if (this._sentContext) {
          return;
        }
        this._sentContext = true;
        console.log("Sending build context to Docker daemon");
        return;
      }
      // Should filter output
      console.log(data);
    }

    pushDocker(tag) {
      if (!tag) {
        return Promise.reject("pushDocker need a tag");
      }
      var args = [];
      args.push("push");
      args.push(tag);
      return this.execute(
        "docker",
        args,
        this.out.bind(this),
        this.out.bind(this)
      );
    }

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
      let source = path.resolve(__dirname + "/../../");
      let includes = files || ["lib"];
      includes.forEach(includePath => {
        let fullpath = __dirname + "/../../" + includePath;
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

    async getDockerfileWebdaShell() {
      let dockerfile = "";
      var shellPackageInfo = require(__dirname + "/../../package.json");
      // Get git rev
      let tag = shellPackageInfo.version;
      if (
        fs.existsSync(__dirname + "/../../.git") &&
        !process.env["WEBDA_SHELL_DEPLOY_VERSION"]
      ) {
        tag = require("child_process").execSync("git describe --dirty --tag");
        if (shellPackageInfo.version !== tag) {
          let includes = ["node_modules", "package.json", "lib", "bin/webda"];
          console.log("Untagged version of webda-shell, copying itself");
          // Copy webda-shell into build directory
          this.copyWebdaShellToDist(includes);
          includes.forEach(path => {
            let fullpath = "./dist/webda-shell/" + path;
            if (fs.lstatSync(fullpath).isDirectory()) {
              path += "/";
              dockerfile += `RUN mkdir -p /webda/node_modules/webda-shell/${path}\n`;
            } else if (path.indexOf("/")) {
              let basedir = path.substring(0, path.lastIndexOf("/") + 1);
              dockerfile += `RUN mkdir -p /webda/node_modules/webda-shell/${basedir}\n`;
            }
            dockerfile += `ADD ${fullpath} /webda/node_modules/webda-shell/${path}\n`;
          });
          dockerfile += `RUN ln -s ../webda-shell/bin/webda /webda/node_modules/.bin\n`;
          return dockerfile;
        }
      }
      if (process.env["WEBDA_SHELL_DEPLOY_VERSION"]) {
        tag = process.env["WEBDA_SHELL_DEPLOY_VERSION"];
      }
      return `RUN yarn add webda-shell@${tag}\n`;
    }

    async getDockerfile(command, logfile = undefined) {
      var cwd = process.cwd();
      var packageInfo = require(cwd + "/package.json");
      var dockerfile = `
  FROM node:latest
  MAINTAINER docker@webda.io
  EXPOSE 18080

  RUN mkdir -p /webda/deployments
  ADD package.json /webda/
  WORKDIR /webda
  RUN yarn install
  `;
      dockerfile += await this.getDockerfileWebdaShell();
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

      if (this.deployment && this.deployment.uuid) {
        // Export deployment
        dockerfile +=
          "RUN node_modules/.bin/webda -d " +
          this.deployment.uuid +
          " config webda.config.json\n";
      }
      dockerfile += "RUN rm -rf deployments\n";
      dockerfile += "CMD node_modules/.bin/webda " + command + logfile + "\n";
      console.log(dockerfile);
      return dockerfile;
    }
  };
}

export { DockerMixIn, Constructor };
