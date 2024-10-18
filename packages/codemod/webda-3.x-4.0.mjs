// Move getService to useService + import
// Binary marker move from Store to Model identifier
// Move DeepPartial @webda/core to @webda/tsc-esm

// Replace all imports
// Specify after a : the exported name to replace
const replacePackages = {
  "@webda/core:DeepPartial": "@webda/tsc-esm:DeepPartial",
  "@webda/core:JSONUtils": "@webda/utils:JSONUtils",
  "@webda/core:FileUtils": "@webda/utils:FileUtils",
  "@testdeck/mocha": "@webda/test",
  "@webda/core:getCommonJS": "@webda/utils:getCommonJS",
  "@webda/core:WebdaQL": "@webda/ql:*WebdaQL"
};

export class WebdaCodemod {
  constructor(options) {
    this.options = options;
  }

  replacePackages() {
    let root = this.root;
    const moveImports = {};
    for (let i in this.options.replacePackages) {
      let [pkg, replace = "*"] = i.split(":");
      moveImports[pkg] ??= {};
      moveImports[pkg][replace] = this.options.replacePackages[i];
    }
    for (let pkg in moveImports) {
      root
        .find(this.j.ImportDeclaration, {
          source: { value: pkg }
        })
        .replaceWith(path => {
          const { node, value } = path;
          // If the package have been renamed completely
          if (moveImports[pkg]["*"]) {
            value.source.value = moveImports[pkg]["*"];
          }
          // Going through each exportName to replace
          for (let i in moveImports[pkg]) {
            if (i === "*") {
              continue;
            }
            value.specifiers = value.specifiers
              .map(s => {
                // This stay in the same package so it is a rename of export
                if (s.imported && s.imported.name === i) {
                  if (moveImports[pkg][i].startsWith(pkg + ":")) {
                    s.imported.name = moveImports[pkg][i].split(":")[1];
                    return s;
                  }
                  // We need to add the import in the file
                  const [newPkg, newExport] = moveImports[pkg][i].split(":");
                  this.addImport(newPkg, newExport);
                  return undefined;
                }
                return s;
              })
              .filter(s => s);
            if (value.specifiers.length === 0) {
              return undefined;
            }
          }
          return node;
        });
    }
  }

  sortImports() {
    const root = this.root;
    const j = this.j;
    const importDeclarations = root.find(j.ImportDeclaration);

    // Convert Collection to an array to use sort()
    const importDeclarationsArray = importDeclarations.nodes();

    // Sort import declarations by source value
    importDeclarationsArray.sort((a, b) => {
      const aSource = a.source.value;
      const bSource = b.source.value;

      const aIsLocal = aSource.startsWith("./") || aSource.startsWith("../");
      const bIsLocal = bSource.startsWith("./") || bSource.startsWith("../");

      if (aIsLocal && !bIsLocal) {
        return 1; // a comes after b
      } else if (!aIsLocal && bIsLocal) {
        return -1; // a comes before b
      } else {
        return aSource.localeCompare(bSource); // Sort alphabetically
      }
    });

    // Remove all existing import declarations
    importDeclarations.remove();

    // Re-insert sorted imports at the top
    const programBody = root.find(j.Program).get("body");
    programBody.unshift(...importDeclarationsArray);
  }

  addImport(pkg, exportName) {
    const j = this.j;
    if (exportName.startsWith("*")) {
      exportName = exportName.substring(1);
      const newImport = this.j.importDeclaration(
        [j.importNamespaceSpecifier(j.identifier(exportName))],
        this.j.literal(pkg)
      );
      this.root.find(this.j.Program).get("body", 0).insertBefore(newImport);
      return;
    }
    let imports = this.root.find(this.j.ImportDeclaration, {
      source: { value: pkg }
    });
    if (imports.length === 0) {
      const newImport = this.j.importDeclaration(
        [this.j.importSpecifier(this.j.identifier(exportName))],
        this.j.literal(pkg)
      );
      this.root.find(this.j.Program).get("body", 0).insertBefore(newImport);
    } else {
      imports.replaceWith(path => {
        const { node, value } = path;
        value.specifiers.push(this.j.importSpecifier(this.j.identifier(exportName)));
        return node;
      });
    }
  }

  process(fileInfo, { j }, options) {
    this.j = j;
    this.root = j(fileInfo.source);
    if (this.options.replacePackages) {
      this.replacePackages();
      this.sortImports();
    }
    return this.root.toSource(this.options.printOptions);
  }
}

const modder = new WebdaCodemod({
  replacePackages,
  printOptions: {
    createParenthesizedExpressions: false
  }
});
// Update package.json?

export default function transformer(fileInfo, api, options) {
  return modder.process(fileInfo, api, options);
  /*
  let root = j(fileInfo.source);

  let identifiers = [];

  // Replace all imports
  for (let i in packagesReplaceMap) {
    root
      .find(j.ImportDeclaration, {
        source: { value: i }
      })
      .replaceWith(path => {
        const { node, value } = path;
        value.source.value = packagesReplaceMap[i].pkg || i;
        if (value.specifiers && packagesReplaceMap[i].imports) {
          value.specifiers.forEach(s => {
            if (s.imported && packagesReplaceMap[i].imports[s.imported.name]) {
              if (s.imported.start === s.local.start) {
                identifiers.push({ name: s.local.name, replace: packagesReplaceMap[i].imports[s.imported.name] });
              }
              s.imported.name = packagesReplaceMap[i].imports[s.imported.name];
            }
          });
        }
        return node;
      });
  }

  identifiers.forEach(i => {
    let replace = i.replace;
    root.find(j.Identifier, { name: i.name }).replaceWith(path => {
      if (path.name === "superClass" || path.name === "typeName") {
        path.node.name = replace;
      }
      return path.node;
    });
  });

  // Update method for getModda to Modda
  root.find(j.MethodDefinition, { key: { name: "getModda" } }).replaceWith(path => {
    // Set Decorator @Modda instead
    let parent = path.parent;
    while (parent) {
      console.log("Parent", parent.name, parent.kind);
    }
    // Remove getModda?
    return undefined;
  });
  /*
  // Change registerCorsFilter
  root.find(j.CallExpression, { callee: { property: { name: "registerCorsFilter" } } }).replaceWith(path => {
    path.value.callee.property.name = "registerRequestFilter";
    return path.node;
  });

  // Rename _getService to getService
  root.find(j.CallExpression, { callee: { property: { name: "_getService" } } }).replaceWith(path => {
    path.value.callee.property.name = "getService";
    return path.node;
  });
  // Rename getTypedService to getService
  root.find(j.CallExpression, { callee: { property: { name: "getTypedService" } } }).replaceWith(path => {
    path.value.callee.property.name = "getService";
    return path.node;
  });
  // Update method for _addRoute
  root.find(j.Identifier, { name: "_addRoute" }).replaceWith(path => {
    path.node.name = "addRoute";
    return path.node;
  });
  // Rename getTypedService to getService
  root
    .find(j.CallExpression, { callee: { property: { name: "_addRoute" }, object: { type: "ThisExpression" } } })
    .replaceWith(path => {
      path.value.callee.property.name = "addRoute";
      return path.node;
    });
  // Rename _params to parameters
  root.find(j.Identifier).replaceWith(path => {
    if (path.value.name === "_params") {
      path.value.name = "parameters";
    }
    return path.node;
  });
  */

  // Replace any
  //return root.toSource(printOptions);
}
