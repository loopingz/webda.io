import { ExpressionStatement, SourceFile, SyntaxKind } from "ts-morph";

/**
 * Morpher module that removes manual `registerRequestFilter(this)` and
 * `registerCORSFilter(this)` calls from service source files.
 *
 * These manual registrations are replaced by the capabilities auto-discovery
 * system. The morpher only removes calls where the argument is `this`
 * (service self-registration). Calls with other arguments (e.g., anonymous
 * objects in test files) are preserved.
 *
 * Also removes commented-out versions of these calls (e.g.,
 * `//this._webda.registerCORSFilter(this);`).
 *
 * @param sourceFile - The ts-morph SourceFile to transform (modified in place)
 *
 * @example
 * ```typescript
 * // Before morpher:
 * class HawkService extends Service {
 *   resolve() {
 *     this.getWebda().registerRequestFilter(this);  // removed
 *     this.getWebda().registerCORSFilter(this);      // removed
 *   }
 * }
 *
 * // After morpher:
 * class HawkService extends Service {
 *   resolve() {
 *     // calls removed — capability auto-discovery handles registration
 *   }
 * }
 * ```
 */
export function removeFilterRegistrations(sourceFile: SourceFile): void {
  // --- Remove live call statements ---
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  const statementsToRemove: ExpressionStatement[] = [];

  for (const call of callExpressions) {
    const callText = call.getText();
    const isFilterCall = callText.includes("registerRequestFilter") || callText.includes("registerCORSFilter");

    if (!isFilterCall) continue;

    const args = call.getArguments();
    if (args.length === 1 && args[0].getText() === "this") {
      const parent = call.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
      if (parent) {
        statementsToRemove.push(parent);
      }
    }
  }

  // Remove in reverse order to preserve node positions
  for (const stmt of statementsToRemove.reverse()) {
    stmt.remove();
  }

  // --- Remove commented-out versions ---
  // Matches lines like:
  //   // this._webda.registerCORSFilter(this);
  //   // this.getWebda().registerRequestFilter(this);
  const fullText = sourceFile.getFullText();
  const commentPattern = /^\s*\/\/\s*this[\._].*register(?:Request|CORS)Filter\(this\);[^\S\n]*\n?/gm;
  const cleaned = fullText.replace(commentPattern, "");
  if (cleaned !== fullText) {
    sourceFile.replaceWithText(cleaned);
  }
}
