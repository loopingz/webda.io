import { ExpressionStatement, SourceFile, SyntaxKind } from "ts-morph";

/**
 * Remove `this.getWebda().registerRequestFilter(this)` and
 * `this.getWebda().registerCORSFilter(this)` call statements,
 * as well as their commented-out equivalents.
 *
 * Calls where the argument is NOT `this` (e.g. anonymous objects in tests) are left untouched.
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
  const commentPattern = /^\s*\/\/\s*this[\._].*register(?:Request|CORS)Filter\(this\);\s*\n?/gm;
  if (commentPattern.test(fullText)) {
    sourceFile.replaceWithText(fullText.replace(commentPattern, ""));
  }
}
