import { useLog } from "@webda/workout";
import { ClassDeclaration, MethodDeclaration, MethodDeclarationStructure, SourceFile, WriterFunction } from "ts-morph";

type Callback = (
  node: ClassDeclaration,
  method?: MethodDeclaration
) => Omit<MethodDeclarationStructure, "kind" | "name" | "statements"> & { statements: string | WriterFunction };
function addOrUpdateMethod(serviceClass: ClassDeclaration, methodName: string, callback: Callback) {
  // Check if a loadParameters method already exists
  const existingMethod = serviceClass.getMethod(methodName);

  if (existingMethod) {
    // Check for the @IgnoreCodemod JSDoc tag
    const jsDoc = existingMethod.getJsDocs()[0];
    const ignoreCodemodTag = jsDoc?.getTags().find(tag => tag.getTagName() === "IgnoreCodemod");

    if (ignoreCodemodTag) {
      useLog("INFO", `Skipping modification of ${serviceClass.getName()}.${methodName}() due to @IgnoreCodemod tag`);
    } else {
      // Overwrite the existing method
      const info = callback(serviceClass, existingMethod);
      if (info.statements) {
        existingMethod.setBodyText(info.statements);
      }
      if (info.scope) {
        existingMethod.setScope(info.scope);
      }
      if (info.parameters) {
        existingMethod.getParameters().forEach(p => p.remove());
        info.parameters.reverse().forEach(p => existingMethod.addParameter(p));
      }

      useLog("INFO", `Overwrote ${serviceClass.getName()}.${methodName}()`);
    }
  } else {
    const method = callback(serviceClass, undefined);
    // Add the method if it doesn't exist
    serviceClass.addMethod({
      ...method,
      name: methodName
    });
    useLog("INFO", `Added loadParameters() to ${serviceClass.getName()}`);
  }
}

export function upsertMethod(sourceFile: SourceFile, className: string, methodName: string, updateCallback?: Callback) {
  // Find all classes that extend 'Service' (you might need to adjust this based on your actual base class)
  const serviceClasses = sourceFile.getClasses().filter(c => c.getBaseClass()?.getName() === className);

  serviceClasses.forEach(serviceClass => {
    addOrUpdateMethod(serviceClass, methodName, updateCallback);
  });
}
