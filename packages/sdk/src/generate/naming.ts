/**
 * TypeScript names of the manifest's schemas and models
 *
 * `WebdaDemo/Task` → `Task`, `WebdaDemo/SubSubProject.action.input` → `SubSubProjectActionInput`,
 * `WebdaDemo/Task.queryResult` → `TaskQueryResult`; a short name used by several namespaces keeps its namespace
 * (`WebdaDemoTask`).
 */

/**
 * @param text - any text
 * @returns its PascalCase identifier
 */
export function pascalCase(text: string): string {
  const words = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const name = words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  return /^[0-9]/.test(name) ? `_${name}` : name || "_";
}

/**
 * @param ref - a schema ref (`Namespace/Name.suffix`)
 * @returns namespace and the rest
 */
export function splitRef(ref: string): { namespace?: string; name: string } {
  const slash = ref.indexOf("/");
  if (slash > 0 && /^[A-Za-z0-9_-]+$/.test(ref.substring(0, slash))) {
    return { namespace: ref.substring(0, slash), name: ref.substring(slash + 1) };
  }
  return { name: ref };
}

/**
 * Assign a unique TypeScript name to every ref
 * @param refs - schema refs
 * @param reserved - names already taken
 * @returns ref to name
 */
export function assignNames(refs: string[], reserved: string[] = []): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set(reserved);
  // How many refs (and reserved names) want each short name
  const wanted = new Map<string, number>();
  for (const name of reserved) wanted.set(name, 1);
  const short = new Map(refs.map(ref => [ref, pascalCase(splitRef(ref).name)]));
  for (const name of short.values()) wanted.set(name, (wanted.get(name) ?? 0) + 1);
  for (const ref of refs) {
    let name = short.get(ref)!;
    if (wanted.get(name)! > 1) {
      const { namespace } = splitRef(ref);
      if (namespace) name = `${pascalCase(namespace)}${name}`;
    }
    // Still taken (same short name in the same namespace, or no namespace to prefix): number it
    let unique = name;
    for (let i = 2; used.has(unique); i++) unique = `${name}${i}`;
    used.add(unique);
    names.set(ref, unique);
  }
  return names;
}

/**
 * @param text - any text
 * @returns a quoted, escaped TypeScript string literal
 */
export function quote(text: string): string {
  return JSON.stringify(text);
}

/**
 * @param name - a property name
 * @returns the name as a property key, quoted when needed
 */
export function propertyKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : quote(name);
}

/**
 * @param text - a doc comment
 * @param indent - indentation
 * @returns the JSDoc block, empty when no text
 */
export function docComment(text: string | undefined, indent: string = ""): string {
  if (!text) return "";
  const lines = text.trim().split("\n");
  if (lines.length === 1) return `${indent}/** ${lines[0].replace(/\*\//g, "* /")} */\n`;
  return `${indent}/**\n${lines.map(line => `${indent} * ${line.replace(/\*\//g, "* /")}`).join("\n")}\n${indent} */\n`;
}
