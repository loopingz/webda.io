let dirname;
/* c8 ignore start */
export async function initialize() {
  // Receives data from `register`.
  dirname = new URL("lib", import.meta.url).toString();
}

export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.toString().startsWith(dirname) && specifier.endsWith(".js")) {
    let url = context.parentURL.toString();
    url = url.substring(0, url.lastIndexOf("/") + 1).replace(/\/lib\//, "/src/") + specifier.replace(/\.js$/, ".ts");
    return {
      url: new URL(url).toString(),
      shortCircuit: true
    };
  }
  if (specifier.includes("packages/core/src/") && specifier.endsWith(".js")) {
    return {
      url: "file://" + specifier.replace(/\.js$/, ".ts"),
      shortCircuit: true
    };
  }
  if (specifier === "@webda/core") {
    return {
      url: new URL("src/index.ts", dirname).toString(),
      shortCircuit: true
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  // Take a resolved URL and return the source code to be evaluated.
  if (url.includes("node_modules/@webda/core/lib/")) {
    let newFile =
      dirname.substring(0, dirname.lastIndexOf("/") + 1) +
      "src" +
      url
        .substring(url.indexOf("node_modules/@webda/core/lib/") + "node_modules/@webda/core/lib".length)
        .replace(/\.js$/, ".ts");
    return {
      format: "module",
      source: `export * from "${newFile}";`,
      shortCircuit: true
    };
  }
  return nextLoad(url, context);
}
/* c8 ignore end */
