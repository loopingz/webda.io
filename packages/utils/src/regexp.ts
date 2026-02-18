/**
 * A utility class that validates strings against one or more regular expressions,
 * automatically anchoring each pattern with `^` and `$` if not already present.
 */
export class RegExpValidator {
  protected validators: RegExp[];

  /**
   * @param info - One or more regex pattern strings to validate against.
   */
  constructor(info: string | string[]) {
    info = Array.isArray(info) ? info : [info];
    this.validators = info.map(i => RegExpValidator.getRegExp(i));
  }

  /**
   * Normalize a regex pattern string by ensuring it is anchored with `^` and `$`.
   *
   * @param reg - The regex pattern string to normalize.
   * @returns A `RegExp` anchored at both start and end.
   */
  static getRegExp(reg: string): RegExp {
    if (!reg.startsWith("^")) {
      reg = "^" + reg;
    }
    if (!reg.endsWith("$")) {
      reg += "$";
    }
    return new RegExp(reg);
  }

  /**
   * Test whether a value matches at least one of the registered patterns.
   *
   * @param value - The string to validate.
   * @returns `true` if the value matches any pattern; otherwise `false`.
   */
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

  /**
   * @param info - One or more values. Entries prefixed with `regex:` are treated as regex
   *   patterns (with the prefix stripped); all others are treated as exact-match strings.
   */
  constructor(info: string | string[]) {
    info = Array.isArray(info) ? info : [info];
    super(info.filter(i => i.startsWith("regex:")).map(i => i.substring(6)));
    this.stringValidators = info.filter(i => !i.startsWith("regex:"));
  }

  /**
   * Test whether a value exactly matches one of the plain strings or any of the regex patterns.
   *
   * @param value - The string to validate.
   * @returns `true` if the value matches an exact string or any regex pattern; otherwise `false`.
   */
  validate(value: string) {
    return this.stringValidators.find(p => p === value) !== undefined || super.validate(value);
  }
}
