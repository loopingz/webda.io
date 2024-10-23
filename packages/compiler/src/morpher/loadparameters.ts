import { ClassDeclaration, Scope, SourceFile, StructureKind, SyntaxKind } from "ts-morph";
import { upsertMethod } from "./utils";

function getTypeArgumentName(serviceClass: ClassDeclaration): string {
  // 1. Check if the class has explicit type arguments for Service
  let typeArgument = serviceClass
    .getHeritageClauseByKind(SyntaxKind.ExtendsKeyword)
    ?.getTypeNodes()[0]
    .getTypeArguments()[0];

  if (!typeArgument) {
    // 2. If no <>, analyze the extended class
    const baseClass = serviceClass.getBaseClass();
    if (baseClass && baseClass.getName() !== "Service") {
      return getTypeArgumentName(baseClass);
    } else {
      // 3. If extending Service directly with no type arguments, use the default
      return "ServiceParameters";
    }
  }

  // 4. If type argument is like <T>, check for default or extends clause
  const typeNode = typeArgument; //.getTypeNode();
  if (typeNode?.getKind() === SyntaxKind.TypeReference) {
    const type = typeNode.getType();
    const defaultType = type.getDefault();
    if (defaultType) {
      return defaultType.getText();
    } else {
      const constraint = type.getConstraint();
      if (constraint) {
        return constraint.getText();
      }
    }
  }

  // 5. If none of the above, use the type argument as is
  return typeArgument.getText();
}

export function setLoadParameters(sourceFile: SourceFile) {
  upsertMethod(sourceFile, "Service", "loadParameters", serviceClass => {
    const typeArgumentName = getTypeArgumentName(serviceClass);
    const statements = `return new ${typeArgumentName}().load(data);`;
    return {
      parameters: [{ name: "data", type: "any" }],
      returnType: typeArgumentName,
      scope: Scope.Protected, // Set to protected
      statements
    };
  });
}
