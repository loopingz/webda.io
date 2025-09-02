import {
  ArrayTypeNode,
  ClassDeclaration,
  MethodDeclaration,
  PropertyAccessExpression,
  Scope,
  SourceFile,
  SyntaxKind,
  ts,
  TypeChecker,
  TypeReferenceNode
} from "ts-morph";
import { upsertMethod } from "./utils";

function hasConstructor(typeReference: TypeReferenceNode) {
  const symbol = typeReference.getType().getSymbol();
  const typeName = typeReference.getText();
  const isClassWithConstructor = symbol
    ?.getDeclarations()
    ?.some(d => d.getKind() === SyntaxKind.ClassDeclaration && (<ClassDeclaration>d).getConstructors().length > 0);
  const isBuiltInConstructor = ["Date", "Array"].includes(typeName); // Add other built-in types as needed
  return isClassWithConstructor || isBuiltInConstructor;
}

export function deserializer(sourceFile: SourceFile, typeChecker: TypeChecker) {
  upsertMethod(sourceFile, "CoreModel", "deserialize", (modelClass: ClassDeclaration, method: MethodDeclaration) => {
    const statements = method?.getStatements() || [];

    const propertyAssignments = new Set<string>();

    // Find existing property assignments within the statements
    statements.forEach(statement => {
      statement.getDescendantsOfKind(SyntaxKind.BinaryExpression).forEach(binaryExpression => {
        if (binaryExpression.getOperatorToken().getKind() === SyntaxKind.EqualsToken) {
          const leftOperand = binaryExpression.getLeft();
          if (leftOperand.getKind() === SyntaxKind.PropertyAccessExpression) {
            propertyAssignments.add((<PropertyAccessExpression>leftOperand).getName());
          }
        }
      });
    });

    // Get all properties of the class
    const classProperties = modelClass.getProperties();

    // Add missing property assignments
    const newStatements: string[] = [...statements.map(statement => statement.getText())];
    classProperties.forEach(property => {
      const propertyName = property.getName();
      if (!propertyAssignments.has(propertyName)) {
        const propertyType = property.getTypeNode();
        5;
        // Check if the type is an ArrayType defined with []
        if (propertyType?.getKind() === SyntaxKind.ArrayType) {
          // Get the array element type using the TypeChecker
          const arrayElementType = (<ArrayTypeNode>(<unknown>propertyType)).getElementTypeNode();

          if (arrayElementType && arrayElementType.getKind() === SyntaxKind.TypeReference) {
            const arrayItemTypeName = arrayElementType.getText();
            // Check if the array item type has a constructor
            if (hasConstructor(arrayElementType as TypeReferenceNode)) {
              newStatements.push(
                `this.${propertyName} = (data.${propertyName} || []).map((item) => new ${arrayItemTypeName}(item));`
              );
              return;
            }
          }
          newStatements.push(`this.${propertyName} = data.${propertyName} || [];`); // Create a copy of the array for any[]
          return;
        }

        if (propertyType?.getKind() === SyntaxKind.TypeReference) {
          const typeReference = propertyType as TypeReferenceNode;
          const typeName = typeReference.getText();
          // Special handling for Array
          if (typeName.startsWith("Array<") || typeName === "Array") {
            // Get the array element type using the TypeChecker
            const arrayElementType = typeReference.getTypeArguments()?.[0];

            if (arrayElementType) {
              if (hasConstructor(arrayElementType as TypeReferenceNode)) {
                if (arrayElementType.getText() === "Buffer") {
                  newStatements.push(
                    `this.${propertyName} = (data.${propertyName} || []).map((item) => Buffer.from(item));`
                  );
                } else {
                  newStatements.push(
                    `this.${propertyName} = (data.${propertyName} || []).map((item) => new ${arrayElementType.getText()}(item));`
                  );
                }
                return;
              }
            }
            newStatements.push(`this.${propertyName} = data.${propertyName} || [];`); // Create a copy of the array
            return;
          }
          if (hasConstructor(typeReference)) {
            // Specific handling for Buffer
            if (typeName === "Buffer") {
              newStatements.push(`this.${propertyName} = Buffer.from(data.${propertyName});`);
            } else {
              newStatements.push(`this.${propertyName} = new ${typeName}(data.${propertyName});`);
            }
            return; // Move to the next property
          }
        }

        if (propertyType?.getKind() === SyntaxKind.ArrayType) {
          if ((<ts.ArrayTypeNode>(<unknown>propertyType)).elementType?.kind === SyntaxKind.TypeReference) {
            const typeName = (<ts.ArrayTypeNode>(<unknown>propertyType)).elementType.getText();
            newStatements.push(
              `this.${propertyName} = (data.${propertyName} || []).forEach(e => new ${typeName}(data.${propertyName}));`
            );
            return;
          }
        }

        // Default assignment if no constructor is needed
        newStatements.push(`this.${propertyName} = data.${propertyName};`);
      }
    });

    if (!statements.find(statement => statement.getText().includes("super.deserialize("))) {
      newStatements.unshift("super.deserialize(data);");
    }

    return {
      parameters: [{ name: "data", type: "any" }],
      scope: Scope.Protected,
      statements: newStatements.join("\n")
    };
  });
}
