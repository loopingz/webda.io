import { useApplication } from "../application/hooks.js";

/**
 * Read a template property path without evaluating JavaScript. The supported string
 * transforms use built-in implementations, never a method supplied by the template data.
 * @param expression - a dotted property path, optionally ending in a supported string transform
 * @param replacements - values available to the template
 * @returns the replacement value
 */
function templateValue(expression: string, replacements: any): unknown {
  const transform = /\.(toUpperCase|toLowerCase|trim|trimStart|trimEnd)\(\)$/.exec(expression);
  const path = transform ? expression.slice(0, transform.index) : expression;
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(path)) {
    throw new Error(`Variable cannot use every javascript features found ${expression}`);
  }
  let value = replacements;
  for (const key of path.split(".")) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      throw new Error(`Variable cannot use every javascript features found ${expression}`);
    }
    value = value != null && Object.hasOwn(value, key) ? value[key] : undefined;
  }
  if (!transform) return value;
  if (typeof value !== "string") throw new Error(`Template transform requires a string: ${expression}`);
  switch (transform[1]) {
    case "toUpperCase":
      return String.prototype.toUpperCase.call(value);
    case "toLowerCase":
      return String.prototype.toLowerCase.call(value);
    case "trim":
      return String.prototype.trim.call(value);
    case "trimStart":
      return String.prototype.trimStart.call(value);
    case "trimEnd":
      return String.prototype.trimEnd.call(value);
  }
}

/**
 * Replace `${path}` parameters and supported string transforms without compiling code.
 * A backslash before `${` leaves a literal placeholder in the result.
 * @param templateString - the template string
 * @param replacements - the replacement values
 * @returns the string with its parameters replaced
 */
function stringParameter(templateString: string, replacements: any = {}): string {
  let result = "";
  let cursor = 0;
  let count = 0;
  let index: number;
  while ((index = templateString.indexOf("${", cursor)) !== -1) {
    const end = templateString.indexOf("}", index + 2);
    if (end === -1) throw new Error("Unterminated template variable");
    if (index > cursor && templateString[index - 1] === "\\") {
      result += templateString.slice(cursor, index - 1) + templateString.slice(index, end + 1);
    } else {
      if (++count > 11) throw new Error("Too many variables");
      result += templateString.slice(cursor, index);
      result += String(templateValue(templateString.slice(index + 2, end), replacements));
    }
    cursor = end + 1;
  }
  return result + templateString.slice(cursor);
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
 * @returns the result
 */
export function templateVariables(object: any, replacements: any = {}): any {
  return replaceVariables(object, { ...replacements, ...useApplication().getProjectInfo(), now: Date.now() });
}

/**
 * Replace the `${...}` variables in every string of an object with exactly the given replacements
 *
 * @param object - the string or object, not modified
 * @param replacements - the variables available to the templates
 * @returns a copy with the variables replaced
 */
export function replaceVariables<T = any>(object: T, replacements: Record<string, any>): T {
  if (typeof object === "string") {
    return stringParameter(object, replacements) as T;
  }

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
