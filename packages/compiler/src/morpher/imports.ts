import { SourceFile, ts } from "ts-morph";

/**
 * Replace all packages according to the constant replacePackages
 * @param sourceFile
 */
export function updateImports(sourceFile: SourceFile, replacePackages: { [key: string]: string }) {
  const moveImports = {};
  // Flat the replacePackage into moveImports
  for (let i in replacePackages) {
    let [pkg, replace = "*"] = i.split(":");
    moveImports[pkg] ??= {};
    if (replace.includes(",")) {
      replace.split(",").forEach(r => {
        moveImports[pkg][r] = replacePackages[i] + ":" + r;
      });
    } else {
      moveImports[pkg][replace] = replacePackages[i];
    }
  }
  // Check for each moved import now
  for (let pkg in moveImports) {
    const importDeclarations = sourceFile
      .getImportDeclarations()
      .filter(declaration => declaration.getModuleSpecifierValue() === pkg);
    const replacements = moveImports[pkg];
    // Update each import declaration
    importDeclarations.forEach(importDeclaration => {
      for (let i in replacements) {
        if (i === "*") {
          // The whole module has been renamed
          importDeclaration.setModuleSpecifier("@webda/test");
          continue;
        }
        // If import is not there yet
        const original = importDeclaration.getNamedImports().find(n => n.getName() === i);
        if (!original) {
          continue;
        }
        // Rename within the module
        const [newPkg, namedImport] = replacements[i].split(":");

        //original.remove();
        if (newPkg == pkg) {
          // Check if the identifier exists already
          const existingGlobalIdentifier = sourceFile
            .getDescendantsOfKind(ts.SyntaxKind.Identifier)
            .find(identifier => {
              // Check if the identifier is a named import with the same name
              const importSpecifier = identifier.getParentIfKind(ts.SyntaxKind.ImportSpecifier);
              return importSpecifier !== undefined && importSpecifier.getName() === namedImport;
            });
          if (existingGlobalIdentifier) {
            original.setName(namedImport).setAlias(i);
          } else {
            // Use the renameAlias so it update all references
            original.renameAlias(namedImport);
            // Set the name to the alias
            original.setName(namedImport);
            // Remove the alias
            original.removeAlias();
          }
        } else {
          original.remove();
          // Move to another module
          let newDeclaration =
            sourceFile.getImportDeclaration(newPkg) ||
            sourceFile.addImportDeclaration({
              moduleSpecifier: newPkg,
              namedImports: namedImport.startsWith("*") ? undefined : namedImport,
              namespaceImport: namedImport.startsWith("*") ? namedImport.substring(1) : undefined
            });
          if (namedImport.startsWith("*")) {
            if (newDeclaration.getNamespaceImport() === undefined) {
              newDeclaration.setNamespaceImport(namedImport.substring(1));
            }
          } else if (!newDeclaration.getNamedImports().find(n => n.getName() === namedImport)) {
            newDeclaration.addNamedImport(namedImport);
          }
        }
      }
      // Remove import if empty
      if (!importDeclaration.getNamespaceImport() && importDeclaration.getNamedImports().length === 0) {
        importDeclaration.remove();
      }
    });
  }
}
