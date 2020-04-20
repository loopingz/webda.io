import { Terminal, WorkerOutput, WorkerLogLevel, WorkerMessage } from "@webda/workout";

export class WebdaTerminal extends Terminal {
  logo: any = require("../../logo.json");
  versions;
  constructor(
    wo: WorkerOutput,
    versions,
    level: WorkerLogLevel = undefined,
    format: string = undefined,
    tty: boolean = undefined
  ) {
    super(wo, level, format, tty);
    this.versions = versions;
    this.setTitle("Webda");
  }

  /**
   * Set the logo to display
   *
   * @param logo to display
   */
  setLogo(logo) {
    this.logo = logo;
  }

  displayHistory(lines) {
    let res = super.displayHistory(lines, true);
    // Inserting logo
    if (this.height > 30 && process.stdout.columns > 50) {
      let lines = res.split("\n");
      let i = 0;
      let logoLength = this.logo[0].length;
      for (let y in this.logo) {
        i = parseInt(y) + this.getFooterSize();
        if (!lines[i]) {
          continue;
        }
        lines[i] =
          this.displayString(lines[i].trim(), process.stdout.columns - logoLength - 1) + this.logo[y].join("") + " ";
      }
      for (let j in this.versions) {
        i++;
        // Center versions
        let version: string = <any>`  ${j} - v${this.versions[j].version}`.bold;
        version = version.padStart(version.length + (logoLength - version.length) / 2).padEnd(logoLength);
        if (lines[i]) {
          lines[i] = this.displayString(lines[i].trim(), process.stdout.columns - logoLength) + version;
        }
      }

      return lines.join("\n");
    }
    return res;
  }

  handleTitleMessage(msg: WorkerMessage) {
    this.setTitle(msg.title);
  }

  setTitle(title: string = "") {
    this.title = this.webdaize(title);
  }

  webdaize(str) {
    if (!this.tty) {
      return str;
    }
    return str.replace(/([Ww])ebda/g, "$1eb" + "da".yellow);
  }

  displayString(str: string, limit: number = undefined) {
    return this.webdaize(super.displayString(str, limit));
  }
}
