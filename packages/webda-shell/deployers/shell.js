"use strict";
const Deployer = require("./deployer");
const fs = require('fs');
const crypto = require('crypto');
const spawn = require('child_process').spawn;

class ShellDeployer extends Deployer {
  deploy(args) {
    if (this.resources.scripts === undefined || this.resources.scripts.length === 0) {
      return Promise.resolve();
    }
    this._maxStep = this.resources.scripts.length;
    var promise = Promise.resolve();
    for (let i in this.resources.scripts) {
      let script = this.resources.scripts[i];
      promise = promise.then(() => {
        if (!script.args) {
          script.args = [];
        }
        if (script.label) {
          this.stepper(script.label);
        } else {
          this.stepper(script.command + ' ' + script.args.join(" "));
        }
        return this.execute(script.command, script.args, this.out.bind(this), this.out.bind(this));
      });
    }
    return promise;
  }

  out(data) {
    console.log(data.toString());
  }

  execute(script, args, onout, onerr) {
    if (args === undefined) {
      args = [];
    }
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
    });
  }

  static getModda() {
    return {
      "uuid": "shell",
      "label": "Shell scripts",
      "description": "Execute a list of scripts",
      "webcomponents": [],
      "logo": "images/placeholders/bash.png",
      "configuration": {
        "default": {
          "params": {},
          "resources": {
            "scripts": [
              {"label": "Listing", "command": "ls", "args": ["-al"]}
            ]
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

module.exports = ShellDeployer;
