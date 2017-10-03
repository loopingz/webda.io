"use strict";
const DockerDeployer = require("./docker");
const fs = require('fs');
const crypto = require('crypto');

class WeDeployDeployer extends DockerDeployer {

  deploy(args) {
    this._sentContext = false;
    if (!this.resources.project || !this.resources.service) {
      console.log('You need to specify both service and project for Wedeploy');
      return Promise.reject();
    }
    this._maxStep = 2;
    this._cleanDockerfile = false;

    return this.checkDockerfile().then(() => {
      return this.wedeploy();
    }).then(() => {
      return this.cleanDockerfile();
    }).catch(() => {
      return this.cleanDockerfile();
    });
  }

  wedeploy() {
    var args = ["deploy", "-p", this.resources.project, "-s", this.resources.service];
    return this.execute("we", args, this.out.bind(this), this.out.bind(this));
  }

  out(data) {
    data = data.toString();
    // Should filter output
    console.log(data);
  }

  checkDockerfile() {
    this.stepper("Checking Dockerfile");
    return new Promise((resolve, reject) => {
      this._cleanDockerfile = true;
      if (this.resources.Dockerfile === 'Dockerfile') {
        this._cleanDockerfile = false;
        return;
      } else if (this.resources.Dockerfile) {
        fs.copyFileSync(this.resources.Dockerfile, this.getDockerfileName());
      } else {
        fs.writeFileSync(this.getDockerfileName(), this.getDockerfile(this.resources.logfile, this.resources.command));
        this.resources.Dockerfile = this.getDockerfileName();
      }
      resolve();
      return;
    });
  }

  getDockerfileName() {
    // Cannot specify the Dockerfile name yet
    return './Dockerfile';
  }

  static getModda() {
    return {
      "uuid": "wedeploy",
      "label": "WeDeploy",
      "description": "Create a Wedeploy service and update it",
      "webcomponents": [],
      "logo": "images/placeholders/wedeploy.png",
      "configuration": {
        "default": {
          "params": {},
          "resources": {
            "project": "projectName",
            "service": "serviceName"
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

module.exports = WeDeployDeployer;
