/* c8 ignore start */
export async function initialize() {
  // Receives data from `register`.
}

export async function resolve(specifier, context, nextResolve) {
  // Take an `import` or `require` specifier and resolve it to a URL.
  return nextResolve(specifier, context, nextResolve);
}

const localModule = `file://${process.cwd()}`;
export async function load(url, context, nextLoad) {
  // Take a resolved URL and return the source code to be evaluated.

  if (url.startsWith(localModule + "/lib/")) {
    const newFile = localModule + "/src/" + url.substring(localModule.length + 5).replace(/\.js$/, ".ts");
    console.log("Replace compiled with source", url, "by", newFile);
    return {
      format: "module",
      source: `export * from "${newFile}";`,
      shortCircuit: true
    };
  }

  return nextLoad(url, context, nextLoad);
}
/* c8 ignore end */
