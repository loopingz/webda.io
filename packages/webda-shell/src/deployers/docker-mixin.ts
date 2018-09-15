const spawn = require('child_process').spawn;
import {
  Deployer
} from './deployer';
import * as fs from 'fs';

type Constructor < T extends Deployer > = new(...args: any[]) => T;

function DockerMixIn < T extends Constructor < Deployer >> (Base: T) {
  return class extends Base {
    _sentContext: boolean;

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
      return this.execute("docker", args, this.out.bind(this), this.out.bind(this), stdin);
    }

    execute(script, args = [], onout, onerr, stdin = undefined) {
      return new Promise((resolve, reject) => {
        var ls = spawn(script, args);

        ls.stdout.on('data', (data) => {
          if (onout) {
            onout(data);
          }
        });

        ls.stderr.on('data', (data) => {
          if (onerr) {
            onerr(data);
          }
        });

        ls.on('close', (code) => {
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
        return Promise.reject('pushDocker need a tag');
      }
      var args = [];
      args.push("push");
      args.push(tag);
      return this.execute("docker", args, this.out.bind(this), this.out.bind(this));
    }


    getDockerfile(command, logfile = undefined) {
      var cwd = process.cwd();
      var version = require(__dirname + '/../../package.json').version;
      var packageInfo = require(cwd + '/package.json');
      var dockerfile = `
  FROM node:latest
  MAINTAINER docker@webda.io
  EXPOSE 18080

  RUN mkdir -p /webda/deployments
  ADD package.json /webda/
  WORKDIR /webda
  RUN yarn install && yarn add webda-shell@\n`;
      dockerfile += version + '\n';
      if (!command) {
        command = 'serve';
      }
      if (logfile) {
        logfile = ' > ' + logfile;
      } else {
        logfile = '';
      }
      dockerfile += 'ADD webda.config.json /webda/\n';
      dockerfile += 'COPY deployments /webda/deployments/\n';
      let includes = packageInfo.files || ['lib'];
      console.log(includes);
      includes.forEach((path) => {
        if (fs.lstatSync(cwd + '/' + path).isDirectory()) {
          path += '/';
          dockerfile += `RUN mkdir /webda/${path}\n`;
        }
        dockerfile += `ADD ${path} /webda/${path}\n`;
      });
      if (this.deployment && this.deployment.uuid) {
        // Export deployment
        dockerfile += 'RUN node_modules/.bin/webda -d ' + this.deployment.uuid + ' config webda.config.json\n';
      }
      dockerfile += 'RUN rm -rf deployments\n';
      dockerfile += 'CMD node_modules/.bin/webda ' + command + logfile + '\n'
      return dockerfile;
    }
  }
}

export {
  DockerMixIn,
  Constructor
};
