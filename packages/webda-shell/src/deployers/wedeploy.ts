import {
  DockerDeployer
} from './docker';
const fs = require('fs');
const crypto = require('crypto');

export class WeDeployDeployer extends DockerDeployer {

  async deploy(args): Promise < any > {
    this._sentContext = false;
    if (!this.resources.project || !this.resources.service) {
      console.log('You need to specify both service and project for Wedeploy');
      throw Error('You need to specify both service and project for Wedeploy');
    }
    this._maxStep = 2;
    if (fs.existsSync(this.getDockerfileName())) {
      throw Error('Cannot have a Dockerfile in the directory');
    }

    try {
      await this.checkDockerfile();
      await this.wedeploy();
    } finally {
      await this.cleanDockerfile();
    }
  }

  wedeploy() {
    this.stepper("WeDeploy...ing");
    var args = ["deploy", "-p", this.resources.project, "-s", this.resources.service];
    return this.execute("we", args, this.out.bind(this), this.out.bind(this));
  }

  out(data) {
    data = data.toString();
    // Should filter output
    console.log(data);
  }

  cleanDockerfile() {
    fs.unlinkSync(this.getDockerfileName());
    return Promise.resolve();
  }

  checkDockerfile() {
    this.stepper("Checking Dockerfile");
    let cmd = '';
    if (this.resources.worker !== 'API') {
      cmd = 'worker ' + this.resources.worker;
    }
    return new Promise(async (resolve, reject) => {
      fs.writeFileSync(this.getDockerfileName(), await this.getDockerfile(cmd));
      resolve();
    });
  }

  getDockerfileName() {
    // Cannot specify the Dockerfile name yet
    return './Dockerfile';
  }

  static getModda() {
    return {
      "uuid": "WebdaDeployer/WeDeploy",
      "label": "WeDeploy",
      "description": "Create a Wedeploy service and update it",
      "webcomponents": [],
      "logo": "images/icons/wedeploy.png",
      "configuration": {
        "default": {},
        "widget": {
          "tag": "webda-wedeploy-deployer",
          "url": "elements/deployers/webda-wedeploy-deployer.html"
        },
        "schema": {
          type: "object"
        }
      }
    }
  }
}
