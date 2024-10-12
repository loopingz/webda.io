/**
 * A utility class that takes a array of string or string transformed into regex that includes
 * a start line and end line
 */
export class RegExpValidator {
  protected validators: RegExp[];
  constructor(info: string | string[]) {
    info = Array.isArray(info) ? info : [info];
    this.validators = info.map(i => RegExpValidator.getRegExp(i));
  }

  static getRegExp(reg: string): RegExp {
    if (!reg.startsWith("^")) {
      reg = "^" + reg;
    }
    if (!reg.endsWith("$")) {
      reg += "$";
    }
    return new RegExp(reg);
  }

  validate(value: string) {
    return this.validators.some(p => p.test(value));
  }
}
/**
 * Standardized way to allow string/regex validation within configuration
 *
 * If url is prefixed with `regex:` it is considered a regex
 *
 * @example
 * ```typescript
 * class MyServiceParameters extends ServiceParameters {
 *    urls: string[];
 * }
 *
 * class MyService extends Service {
 *    loadParameters(params:any) {
 *      const parameters = new MyServiceParameters(params);
 *      this.urlsValidator = new RegExpStringValidator(parameters.urls);
 *      return parameters;
 *    }
 * }
 * ```
 */
export class RegExpStringValidator extends RegExpValidator {
  stringValidators: string[];
  constructor(info: string | string[]) {
    info = Array.isArray(info) ? info : [info];
    super(info.filter(i => i.startsWith("regex:")).map(i => i.substring(6)));
    this.stringValidators = info.filter(i => !i.startsWith("regex:"));
  }

  /**
   * Add string validation
   * @param value
   * @returns
   */
  validate(value: string) {
    return this.stringValidators.find(p => p === value) !== undefined || super.validate(value);
  }
}
