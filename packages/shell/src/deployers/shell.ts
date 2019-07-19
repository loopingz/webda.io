import { Deployer } from "./deployer";
import { DockerMixIn } from "./docker-mixin";
const fs = require("fs");
const crypto = require("crypto");
const spawn = require("child_process").spawn;

export class ShellDeployer extends DockerMixIn(Deployer) {
  async deploy(args) {
    if (
      this.resources.scripts === undefined ||
      this.resources.scripts.length === 0
    ) {
      return;
    }
    this._maxStep = this.resources.scripts.length;
    for (let i in this.resources.scripts) {
      let script = this.resources.scripts[i];
      if (!script.args) {
        script.args = [];
      }
      if (script.label) {
        this.stepper(script.label);
      } else {
        this.stepper(script.command + " " + script.args.join(" "));
      }
      await this.execute(
        script.command,
        script.args,
        this.out.bind(this),
        this.out.bind(this)
      );
    }
  }

  out(data) {
    console.log(data.toString());
  }

  static getModda() {
    return {
      uuid: "WebdaDeployer/Shell",
      label: "Shell scripts",
      description: "Execute a list of scripts",
      webcomponents: [],
      logo: "images/icons/shell.png",
      configuration: {
        default: {
          params: {},
          resources: {
            scripts: [
              {
                label: "Listing",
                command: "ls",
                args: ["-al"]
              }
            ]
          },
          services: {}
        },
        schema: {
          type: "object"
        }
      }
    };
  }
}
