import { Terminal, WorkerOutput, WorkerLogLevel, WorkerMessage } from "@webda/workout";

export class WebdaTerminal extends Terminal {
  logo: string[] = `[48;5;236m [48;5;61m                  [48;5;67m [48;5;178m                  [48;5;136m [48;5;237m [0m
[48;5;61m                   [48;5;208m                    [48;5;172m [0m
[48;5;61m                  [48;5;244m [48;5;208m                    [48;5;172m [0m
[48;5;61m                  [48;5;66m [48;5;208m   [48;5;172m [48;5;137m  [48;5;208m              [48;5;172m [0m
[48;5;61m                         [48;5;66m [48;5;208m             [48;5;172m [0m
[48;5;61m                         [48;5;244m [48;5;208m             [48;5;172m [0m
[48;5;61m                  [48;5;146m [48;5;231m      [48;5;255m [48;5;60m [48;5;172m [48;5;208m           [48;5;172m [0m
[48;5;61m                [48;5;104m [48;5;231m          [48;5;146m [48;5;137m [48;5;208m          [48;5;172m [0m
[48;5;61m           [48;5;231m                 [48;5;96m [48;5;208m          [48;5;172m [0m
[48;5;61m          [48;5;254m [48;5;231m                 [48;5;188m [48;5;60m [48;5;137m [48;5;208m        [48;5;172m [0m
[48;5;72m [48;5;107m      [48;5;67m [48;5;231m                       [48;5;255m [48;5;61m [48;5;255m [48;5;231m     [48;5;195m [0m
[48;5;108m [48;5;107m     [48;5;60m [48;5;231m                          [48;5;67m [48;5;231m     [48;5;255m [0m
[48;5;108m [48;5;107m     [48;5;66m [48;5;146m [48;5;231m                        [48;5;188m [48;5;146m [48;5;231m     [48;5;255m [0m
[48;5;108m [48;5;107m       [48;5;60m [48;5;146m [48;5;231m                     [48;5;103m [48;5;146m [48;5;231m      [48;5;255m [0m
[48;5;108m [48;5;107m          [48;5;65m     [48;5;239m    [48;5;65m     [48;5;237m [48;5;249m  [48;5;250m [48;5;252m [48;5;254m [48;5;231m        [48;5;255m [0m
[48;5;108m [48;5;107m                        [48;5;241m [48;5;231m             [48;5;255m [0m
[48;5;108m [48;5;107m                   [48;5;59m [48;5;108m [48;5;107m  [48;5;108m [48;5;243m [48;5;231m             [48;5;255m [0m
[48;5;108m [48;5;107m                  [48;5;242m [48;5;231m                   [48;5;255m [0m
[48;5;108m [48;5;107m                  [48;5;242m [48;5;231m                   [48;5;255m [0m
[48;5;72m [48;5;107m                  [48;5;240m [48;5;231m                   [48;5;146m [0m
    `.split("\n");
  logoWidth: number;
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
    this.logoWidth = Math.max(...this.logo.map(this.getTrueLength));
  }

  /**
   * Set the logo to display
   *
   * @param logo to display
   */
  setLogo(logo: string[]) {
    this.logo = logo;
    this.logoWidth = Math.max(...this.logo.map(this.getTrueLength));
  }

  displayHistory(lines) {
    let res = super.displayHistory(lines, true);
    // Inserting logo
    if (this.height > 30 && process.stdout.columns > 50) {
      let lines = res.split("\n");
      let i = 0;
      for (let y in this.logo) {
        i = parseInt(y) + this.getFooterSize();
        if (!lines[i]) {
          continue;
        }
        lines[i] =
          this.displayString(lines[i].trim(), process.stdout.columns - this.logoWidth - 1) +
          this.logo[y].padEnd(this.logoWidth) +
          " ";
      }
      for (let j in this.versions) {
        i++;
        // Center versions
        let version: string = <any>`  ${j} - v${this.versions[j].version}`.bold;
        version = version.padStart(version.length + (this.logoWidth - version.length) / 2).padEnd(this.logoWidth);
        if (lines[i]) {
          lines[i] = this.displayString(lines[i].trim(), process.stdout.columns - this.logoWidth) + version;
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
