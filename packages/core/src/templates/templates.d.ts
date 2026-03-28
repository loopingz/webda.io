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
export declare function templateVariables(object: any, replacements?: any): any;
//# sourceMappingURL=templates.d.ts.map