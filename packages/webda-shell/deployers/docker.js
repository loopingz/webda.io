"use strict";
const ShellDeployer = require("./shell");
const fs = require('fs');
const crypto = require('crypto');

class DockerDeployer extends ShellDeployer {

  deploy(args) {
    this._sentContext = false;
    this._maxStep = 3;
    if (!this.resources.tag || !this.resources.push) {
      this._maxStep = 2;
    }
    this._cleanDockerfile = false;

    return this.checkDockerfile().then(() => {
      return this.buildDocker();
    }).then(() => {
      if (!this.resources.tag || !this.resources.push) {
        return Promise.resolve();
      }
      return this.pushDocker();
    }).then(() => {
      this.cleanDockerfile();
    }).catch(() => {
      this.cleanDockerfile();
    });
  }

  cleanDockerfile() {
    if (this._cleanDockerfile) {
      fs.unlinkSync("./Dockerfile")
    }
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

  buildDocker() {
    this.stepper("Building Docker image");
    var args = [];
    args.push("build");
    if (this.resources.tag) {
      args.push("--tag");
      args.push(this.resources.tag);
    }
    if (this.resources.Dockerfile) {
      args.push("--file");
      args.push(this.resources.Dockerfile);
    }
    args.push(".");
    console.log("docker " + args.join(" "));
    return this.execute("docker", args, this.out.bind(this), this.out.bind(this));
  }

  pushDocker() {
    this.stepper("Pushing Docker image");
    var args = [];
    args.push("push");
    args.push(this.resources.tag);
    return this.execute("docker", args, this.out.bind(this), this.out.bind(this));
  }

  checkDockerfile() {
    this.stepper("Checking Dockerfile");
    return new Promise((resolve, reject) => {
      if (this.resources.Dockerfile) {
        resolve();
        return;
      }
      if (!this.resources.Dockerfile) {
        this._cleanDockerfile = true;
        fs.writeFileSync('./.webda.Dockerfile', this.getDockerfile(this.resources.logfile, this.resources.command));
        this.resources.Dockerfile = './.webda.Dockerfile'
      }
      resolve();
    });
  }

  getDockerfile(logfile, command) {
    var dockerfile = `
FROM node:latest
MAINTAINER docker@webda.io

RUN mkdir /server/
ADD . /server/

RUN cd /server && rm -rf node_modules && npm install
`;
    console.log('getDockerfile');
    if (!command) {
      command = 'serve';
    }
    if (!logfile) {
      logfile = '/data/webda.log';
    }
    if (!this.deployment.uuid) {
      // Export deployment
      dockerfile += 'RUN cd /server && webda -d ' + this.deployment.uuid + ' config webda.config.json\n';
    }
    dockerfile += 'RUN cd /server && rm -rf deployments\n';
    dockerfile += 'CMD cd /server && node_modules/.bin/webda ' + command + ' > ' + logfile + '\n'
    return dockerfile;
  }

  static getModda() {
    return {
      "uuid": "docker",
      "label": "Docker",
      "description": "Create a Docker image and push it",
      "webcomponents": [],
      "logo": "images/placeholders/docker.png",
      "configuration": {
        "default": {
          "params": {},
          "resources": {
            "tag": "ImageTag",
            "push": false
          },
          "services": {}
        },
        "schema": {
          type: "object"
        }
      }
    }
  }
}

module.exports = DockerDeployer;