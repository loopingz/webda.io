const util = require("util");
// Update packages
const packagesReplaceMap = {
  webda: {
    pkg: "@webda/core",
    imports: {
      Executor: "Service"
    }
  },
  "webda-aws": { pkg: "@webda/aws" },
  "webda-shell": { pkg: "@webda/shell" },
  "webda-elasticsearch": { pkg: "@webda/elasticsearch" },
  "mocha-typescript": { pkg: "@testdeck/mocha" },
  "webda/lib/test": { pkg: "@webda/core/lib/test" }
};

// Update package.json?

export default function transformer(fileInfo, api, options) {
  const j = api.jscodeshift;
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const printOptions = options.printOptions || {
    createParenthesizedExpressions: false
  };
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

  // Change registerCorsFilter
  root.find(j.CallExpression, { callee: { property: { name: "registerCorsFilter" } } }).replaceWith(path => {
    path.value.callee.property.name = "registerRequestFilter";
    return path.node;
  });
  // Update method for RequestFilter
  root.find(j.MethodDefinition, { key: { name: "checkCSRF" } }).replaceWith(path => {
    path.value.key.name = "checkRequest";
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
  // Rename _params to parameters
  root.find(j.Identifier).replaceWith(path => {
    if (path.value.name === "_params") {
      path.value.name = "parameters";
    }
    return path.node;
  });

  // Replace any
  return root.toSource(printOptions);
}
