/**
 * Extract the name of a decorator node (supports `@Foo` and `@Foo(...)` and `@ns.Foo(...)`)
 * @param decorator - ESTree/TSESTree Decorator node
 * @returns The decorator identifier name, or undefined
 */
export function getDecoratorName(decorator: any): string | undefined {
  if (!decorator || !decorator.expression) {
    return undefined;
  }
  const expr = decorator.expression.type === "CallExpression" ? decorator.expression.callee : decorator.expression;
  if (expr.type === "Identifier") {
    return expr.name;
  }
  if (expr.type === "MemberExpression" && expr.property?.type === "Identifier") {
    return expr.property.name;
  }
  return undefined;
}

/**
 * Find a matching decorator on a class, method, or property node
 * @param node - AST node that may have a `decorators` array
 * @param names - Decorator name or list of names to match
 * @returns The matching Decorator node, or undefined
 */
export function findDecorator(node: any, names: string | string[]): any | undefined {
  const target = Array.isArray(names) ? names : [names];
  if (!Array.isArray(node?.decorators)) {
    return undefined;
  }
  return node.decorators.find((dec: any) => {
    const name = getDecoratorName(dec);
    return name !== undefined && target.includes(name);
  });
}

/**
 * Get the superclass identifier name for a ClassDeclaration or ClassExpression
 * @param classNode - Class AST node
 * @returns Superclass name, or undefined if none or non-simple expression
 */
export function getClassExtendsName(classNode: any): string | undefined {
  const sc = classNode?.superClass;
  if (!sc) {
    return undefined;
  }
  if (sc.type === "Identifier") {
    return sc.name;
  }
  if (sc.type === "MemberExpression" && sc.property?.type === "Identifier") {
    return sc.property.name;
  }
  return undefined;
}

/**
 * Check if a class node is a Webda Model (extends CoreModel, OwnerModel, or *Model)
 * @param classNode - Class AST node
 * @returns True if the class extends a known Webda Model base class
 */
export function isModelClass(classNode: any): boolean {
  const superName = getClassExtendsName(classNode);
  if (!superName) {
    return false;
  }
  return superName === "CoreModel" || superName === "OwnerModel" || superName.endsWith("Model");
}

/**
 * Check if a class node is a Webda Service (extends Service, Store, or *Service / *Store)
 * @param classNode - Class AST node
 * @returns True if the class extends a Webda Service or Store base class
 */
export function isServiceClass(classNode: any): boolean {
  const superName = getClassExtendsName(classNode);
  if (!superName) {
    return false;
  }
  return (
    superName === "Service" || superName === "Store" || superName.endsWith("Service") || superName.endsWith("Store")
  );
}

/**
 * Check if a filename corresponds to a test file
 * @param filename - File path from ESLint context
 * @returns True if the file is a test or spec file
 */
export function isTestFile(filename: string): boolean {
  return /\.(spec|test|bench)\.[jt]sx?$/.test(filename) || /[/\\](test|bench)[/\\]/.test(filename);
}

/**
 * Extract the type annotation name of a parameter node (handles TSParameterProperty too)
 * @param param - Function parameter AST node
 * @returns Type name string if it is a TSTypeReference with an Identifier, otherwise undefined
 */
export function getParameterTypeAnnotation(param: any): any | undefined {
  const target = param?.type === "TSParameterProperty" ? param.parameter : param;
  return target?.typeAnnotation?.typeAnnotation;
}

/**
 * Find the enclosing ClassDeclaration or ClassExpression for a node
 * @param node - Starting AST node
 * @returns The nearest ancestor class node, or undefined
 */
export function findEnclosingClass(node: any): any | undefined {
  let current = node?.parent;
  while (current) {
    if (current.type === "ClassDeclaration" || current.type === "ClassExpression") {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}
