import * as ts from "typescript";
import { writeFileSync } from "fs";
import { basename } from "path";

export function createFrontendAST(sourceFile: ts.SourceFile): ts.SourceFile {
  const frontendNodes: ts.Node[] = [];

  function visit(node: ts.Node) {
    // Check for @Frontend JSDoc tag
    const jsDoc = (node as any).jsDoc;
    const hasFrontendTag =
      jsDoc &&
      jsDoc.some((doc: any) => doc.tags && doc.tags.some((tag: any) => tag.tagName.escapedText === "Frontend"));

    if (hasFrontendTag) {
      // If node is a class, add all its members (attributes and methods)
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        frontendNodes.push(node);
        node.members.forEach(member => frontendNodes.push(member));
        return; // Don't visit the class members again
      }

      // If node is a method, and its parent class doesn't have the tag,
      // add the parent class to the frontendNodes array, but only export
      // methods with the @Frontend tag.
      if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
        const parentClass = node.parent;
        if (ts.isClassDeclaration(parentClass) || ts.isClassExpression(parentClass)) {
          const classJsDoc = (parentClass as any).jsDoc;
          const classHasFrontendTag =
            classJsDoc &&
            classJsDoc.some(
              (doc: any) => doc.tags && doc.tags.some((tag: any) => tag.tagName.escapedText === "Frontend")
            );
          if (!classHasFrontendTag) {
            // Only export methods with @Frontend from this class
            const frontendMethods = parentClass.members.filter(member => {
              const methodJsDoc = (member as any).jsDoc;
              return (
                methodJsDoc &&
                methodJsDoc.some(
                  (doc: any) => doc.tags && doc.tags.some((tag: any) => tag.tagName.escapedText === "Frontend")
                )
              );
            });
            frontendNodes.push(...frontendMethods);
            return; // Don't add the method individually
          }
        }
      }

      frontendNodes.push(node);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Create a new source file with only the frontendNodes
  const node = ts.createSourceFile(
    sourceFile.fileName.replace(".ts", ".frontend.ts"),
    frontendNodes.map(node => node.getText()).join("\n"),
    sourceFile.languageVersion,
    true,
    ts.ScriptKind.TS
  );
  // Create a new source file with only the frontendNodes, preserving comments
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
  const result = printer.printList(ts.ListFormat.MultiLine, ts.factory.createNodeArray(frontendNodes), sourceFile);
  if (result) {
    writeFileSync("./frontend/" + basename(sourceFile.fileName.replace(".ts", ".frontend.ts")), result);
  }
  return sourceFile;
}

export default function transformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => (sourceFile: ts.SourceFile) => {
    return createFrontendAST(sourceFile);
  };
}
