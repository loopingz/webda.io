import { useApplication } from "../application/hooks";

function stringParameter(templateString: string, replacements: any = {}) {
    // Optimization if no parameter is found just skip the costy function
    if (templateString.indexOf("${") < 0) {
      return templateString;
    }

    let scan = templateString;
    let index;
    let i = 0;
    while ((index = scan.indexOf("${")) >= 0) {
      // Add escape sequence
      if (index > 0 && scan.substring(index - 1, 1) === "\\") {
        scan = scan.substring(scan.indexOf("}", index));
        continue;
      }
      const next = scan.indexOf("}", index);
      const variable = scan.substring(index + 2, next);
      scan = scan.substring(next);
      if (variable.match(/[|&;<>\\{]/)) {
        throw new Error(`Variable cannot use every javascript features found ${variable}`);
      }
      if (i++ > 10) {
        throw new Error("Too many variables");
      }
    }
    return new Function(
      "return `" + (" " + templateString).replace(/([^\\])\$\{([^}{]+)}/g, "$1${this.$2}").substring(1) + "`;"
    ).call({
      ...this.baseConfiguration.cachedModules.project,
      ...replacements
    });
  }

  /**
   * Allow variable inside object strings
   *
   * Example
   * ```js
   * replaceVariables({
   *  myobj: "${test.replace}"
   * }, {
   *  test: {
   *    replace: 'plop'
   *  }
   * })
   * ```
   * will return
   * ```
   * {
   *  myobj: 'plop'
   * }
   * ```
   *
   * By default the replacements map contains
   * ```
   * {
   *  git: GitInformation,
   *  package: 'package.json content',
   *  deployment: string,
   *  now: number,
   *  ...replacements
   * }
   * ```
   *
   * See: {@link GitInformation}
   *
   * @param object a duplicated object with replacement done
   * @param replacements additional replacements to run
   */
export function templateVariables(object: any, replacements: any = {}): any {
    replacements = {...replacements, ... useApplication().getProjectInfo(), now: Date.now() };
    if (typeof object === "string") {
      return stringParameter(object, replacements);
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    return JSON.parse(
      // eslint-disable-next-line func-names
      JSON.stringify(object, function (key: string, value: any) {
        if (typeof this[key] === "string") {
          return stringParameter(value, replacements);
        }
        return value;
      })
    );
}