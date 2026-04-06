
const COMMENTS = Symbol("comments");

/** Base class for all nodes in a JSONC abstract syntax tree, carrying associated comment metadata. */
abstract class JSONCNode {
  /** Wrap a plain JS value into the appropriate JSONCNode subclass. */
  static fromValue(arg0: any): JSONCObject | JSONCValue | JSONCArray {
    if (arg0["$$target"] instanceof JSONCNode || arg0 instanceof JSONCArrayProxy) {
      return <any>arg0;
    }
    if (Array.isArray(arg0)) {
      return new JSONCArray(arg0);
    } else if (typeof arg0 === "object") {
      return new JSONCObject(arg0);
    } else {
      return new JSONCValue(arg0);
    }
  }
  [COMMENTS]: {
    prefix: string;
    suffix: string;
    endOfLine: string;
    startEndOfLine: string;
  } = {
    prefix: "",
    suffix: "",
    endOfLine: "",
    startEndOfLine: ""
  };

  /** Copy all comment metadata from another node onto this one. */
  cloneComments(node: JSONCNode) {
    Object.keys(this[COMMENTS]).forEach(key => {
      this[COMMENTS][key] = node[COMMENTS][key];
    });
  }
}

/** Remove block comments from a string. */
function stripComments(str: string) {
  return str.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Represents a JSONC object `{ ... }` with ordered properties and formatting metadata. */
class JSONCObject extends JSONCNode {
  indentation: number = 2;
  sorted: boolean = false;
  multiline: boolean = true;

  constructor(value?: any) {
    super();
    if (value) {
      this.properties = Object.keys(value).map(key => {
        return new JSONCProperty(new JSONCKey(key), JSONCNode.fromValue(value[key]));
      });
    }
  }
  properties: JSONCProperty[] = [];

  /** Detect indentation, multiline layout, and sort order from existing properties. */
  computeFormatting() {
    // Keep with the default formatting
    if (this.properties.length === 0) {
      return;
    }
    // Check if the properties are sorted
    const sorted = this.properties.map(prop => prop.key.name).sort();
    this.multiline = false;
    let currentCount = -1;
    this.sorted = true;
    for (const ind in this.properties) {
      if (this.properties[ind].key.name !== sorted[ind]) {
        this.sorted = false;
      }
      if (this.properties[ind][COMMENTS].endOfLine.includes("\n")) {
        this.multiline = true;
      }
      const uncommented = stripComments(this.properties[ind].key[COMMENTS].prefix).split("\n").pop().length;
      if (currentCount === -1) {
        currentCount = uncommented;
      } else if (currentCount !== uncommented) {
        // Cannot determine the indentation
        currentCount = -2;
      }
    }
    // By default use current object indentation + 2
    if (currentCount === -2) {
      this.indentation = 2 + stripComments(this[COMMENTS].prefix.split("\n").pop()).length;
    } else {
      this.indentation = currentCount;
    }
  }

  /** Add a property to this object, maintaining sort order and `$schema`-first placement. */
  addProperty(property: JSONCProperty) {
    property.key[COMMENTS].prefix = " ".repeat(this.indentation);
    if (this.multiline) {
      property[COMMENTS].endOfLine = "\n";
    }
    // Schema should always be the first property
    if (property.key.name === "$schema") {
      this.properties.unshift(property);
    } else {
      this.properties.push(property);
    }
    if (this.sorted) {
      this.properties.sort((a, b) => a.key.name.localeCompare(b.key.name));
    }
  }

  /** Serialize this object to a JSONC string, preserving comments and whitespace. */
  toString(separator: string = "") {
    let res = this[COMMENTS].prefix + "{" + this[COMMENTS].startEndOfLine;
    for (let i = 0; i < this.properties.length; i++) {
      res += this.properties[i].toString(i < this.properties.length - 1 ? "," : "");
    }
    res += this[COMMENTS].suffix + "}" + separator + this[COMMENTS].endOfLine;
    return res;
  }

  /** Return a Proxy that behaves like a plain object but writes back to this JSONC tree. */
  toProxy() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return new Proxy(this.toJSON(), {
      get: (target, prop) => {
        if (prop == "toString") {
          // eslint-disable-next-line
          return function () {
            return self.toString();
          };
        }
        if (prop == "toJSON") {
          // eslint-disable-next-line
          return function () {
            return self.toJSON();
          };
        }
        if (prop === "$$target") {
          return self;
        }
        const property = self.properties.find(p => p.key.name === prop);
        return property ? property.value.toProxy() : undefined;
      },
      set: (target, prop, value) => {
        const property = self.properties.find(p => p.key.name === prop);
        const newValue = JSONCNode.fromValue(value);
        if (property) {
          newValue.cloneComments(property.value);
          property.value = newValue;
        } else {
          self.addProperty(new JSONCProperty(new JSONCKey(prop as string), newValue));
        }
        return true;
      },
      deleteProperty: (target, prop) => {
        const index = self.properties.findIndex(p => p.key.name === prop);
        if (index !== -1) {
          self.properties.splice(index, 1);
        }
        return true;
      }
    });
  }

  /** Convert to a plain JavaScript object (strips comments). */
  toJSON() {
    const obj: any = {};
    this.properties.forEach(prop => {
      obj[prop.key.name] = prop.value.toJSON();
    });
    return obj;
  }
}

/** Represents a JSONC leaf value (string, number, boolean, or null). */
class JSONCValue extends JSONCNode {
  value: any;
  [COMMENTS] = {
    prefix: " ",
    suffix: "",
    endOfLine: "",
    startEndOfLine: ""
  };

  constructor(value: any) {
    super();
    this.value = value;
  }

  /** Serialize the value with its surrounding comments and whitespace. */
  toString(sep: string = "") {
    return this[COMMENTS].prefix + JSON.stringify(this.value) + this[COMMENTS].suffix + sep + this[COMMENTS].endOfLine;
  }

  /** Return the raw value (no proxy needed for scalars). */
  toProxy() {
    return this.value;
  }

  /** Return the raw value. */
  toJSON() {
    return this.value;
  }
}

/** Represents a key-value pair inside a JSONCObject. */
class JSONCProperty extends JSONCNode {
  key: JSONCKey;
  value: JSONCValue | JSONCObject | JSONCArray;

  constructor(key: JSONCKey, value: JSONCValue | JSONCObject | JSONCArray) {
    super();
    this.key = key;
    this.value = value;
  }

  /** Serialize this property as `"key": value` with comments preserved. */
  toString(separator: string = "") {
    return (
      this[COMMENTS].prefix + this.key.toString() + ":" + this.value.toString() + this[COMMENTS].suffix + separator + this[COMMENTS].endOfLine
    );
  }
}

/** Represents a quoted property key inside a JSONC object. */
class JSONCKey extends JSONCNode {
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  /** Serialize the key as a double-quoted string with surrounding whitespace/comments. */
  toString() {
    return this[COMMENTS].prefix + `"${this.name}"` + this[COMMENTS].suffix;
  }
}

/** Array subclass that mirrors mutations to the underlying JSONCArray AST node. */
class JSONCArrayProxy extends Array {
  /** Return plain Array for derived methods like `map` and `filter`. */
  static get [Symbol.species]() {
    return Array;
  }

  constructor(private array: JSONCArray) {
    super();
    array.elements.forEach(el => {
      super.push(el.toProxy());
    });
  }

  /** Append items to both the proxy array and the underlying AST. */
  push(...items: any[]): number {
    this.array.elements.push(...this.mapper(items));
    return super.push(...items);
  }

  /** Remove the last element from both the proxy array and the underlying AST. */
  pop(): any | undefined {
    this.array.elements.pop();
    return super.pop();
  }

  /** Remove the first element from both the proxy array and the underlying AST. */
  shift() {
    this.array.elements.shift();
    return super.shift();
  }

  /** Convert plain values to JSONC nodes with appropriate formatting for this array. */
  mapper(items: any[]) {
    return items.map(item => this.array.computePrefix(JSONCNode.fromValue(item)));
  }

  /** Prepend items to both the proxy array and the underlying AST. */
  unshift(...items: any[]): number {
    this.array.elements.unshift(...this.mapper(items));
    return super.unshift(...items);
  }

  /** Splice elements in both the proxy array and the underlying AST. */
  splice(start: unknown, deleteCount?: unknown, ...rest: unknown[]): any[] {
    this.array.elements.splice(start as number, deleteCount as number, ...this.mapper(rest));
    return super.splice(start as number, deleteCount as number, ...rest);
  }
}

/** Represents a JSONC array `[ ... ]` with elements and formatting metadata. */
class JSONCArray extends JSONCNode {
  multiline: boolean = true;
  indentation: number = 2;

  constructor(value?: any[]) {
    super();
    this.elements =
      value?.map((el: any) => {
        return JSONCNode.fromValue(el);
      }) || [];
  }

  elements: (JSONCValue | JSONCObject | JSONCArray)[];

  /** Detect indentation and multiline layout from existing elements. */
  computeFormatting() {
    // Keep with the default formatting
    if (this.elements.length === 0) {
      this.indentation = stripComments(this[COMMENTS].prefix.split("\n").pop()).length + 2;
      return;
    }
    // Check if the properties are sorted
    this.multiline = false;
    let currentCount = -1;
    for (const ind in this.elements) {
      if (this.elements[ind][COMMENTS].endOfLine.includes("\n")) {
        this.multiline = true;
      }
      const uncommented = stripComments(this.elements[ind][COMMENTS].prefix).split("\n").pop().length;
      if (currentCount === -1) {
        currentCount = uncommented;
      } else if (currentCount !== uncommented) {
        // Cannot determine the indentation
        currentCount = -2;
      }
    }
    // By default use current object indentation + 2
    if (currentCount === -2) {
      this.indentation = 2 + stripComments(this[COMMENTS].prefix.split("\n").pop()).length;
    } else {
      this.indentation = currentCount;
    }
  }

  /** Apply this array's indentation and newline style to a new element node. */
  computePrefix(property: JSONCObject | JSONCValue | JSONCArray) {
    if (this.multiline) {
      property[COMMENTS].prefix = " ".repeat(this.indentation);
    } else {
      property[COMMENTS].prefix = " ";
    }
    property[COMMENTS].endOfLine = this.multiline ? "\n" : "";
    return property;
  }

  /** Serialize this array to a JSONC string, preserving comments and whitespace. */
  toString() {
    let res = this[COMMENTS].prefix + "[";
    for (let i = 0; i < this.elements.length; i++) {
      res += this.elements[i].toString(i < this.elements.length - 1 ? "," : "");
    }
    res += this[COMMENTS].suffix + "]" + this[COMMENTS].endOfLine;
    return res;
  }

  /** Return a JSONCArrayProxy that mirrors mutations back to this AST node. */
  toProxy() {
    return new JSONCArrayProxy(this);
  }

  /** Convert to a plain JavaScript array (strips comments). */
  toJSON() {
    return this.elements.map(el => el.toJSON());
  }
}

/** Parse a JSONC string into an AST of JSONCNode objects and return a proxy for manipulation. */
function parseJsoncToTree(jsoncString: string): any {
  let i = 0;
  const res = parseValue();
  return res instanceof JSONCNode ? res.toProxy() : res;

  /** Parse the next JSON value (object, array, string, keyword, or number) at position `i`. */
  function parseValue(): JSONCValue | JSONCObject | JSONCArray | null {
    const first = i == 0;
    const prefix = skipWhitespace();
    const char = jsoncString[i];
    let value: JSONCValue | JSONCObject | JSONCArray | null = null;

    if (char === "{") {
      value = parseObject();
    } else if (char === "[") {
      value = parseArray();
    } else if (char === '"') {
      value = parseString();
    } else if (char === "t" || char === "f" || char === "n") {
      value = parseKeyword();
    } else if (char === "-" || (char >= "0" && char <= "9")) {
      value = parseNumber();
    } else {
      // Handle invalid characters or unexpected end of input
      throw new Error(`Unexpected character at position ${i} : '${jsoncString[i]}'`);
    }
    value[COMMENTS].prefix = prefix;
    if (first) {
      value[COMMENTS].endOfLine += jsoncString.substring(i);
    }
    return value;
  }

  /** Parse a JSONC object `{ ... }` starting after the opening brace. */
  function parseObject(): JSONCObject {
    const obj = new JSONCObject();
    i++; // Consume '{'
    let whitespace = skipWhitespace();
    if (whitespace.includes("\n")) {
      const lines = whitespace.split("\n");
      obj[COMMENTS].startEndOfLine = lines.shift() + "\n";
      whitespace = lines.join("\n");
    }

    while (i < jsoncString.length && jsoncString[i] !== "}") {
      const key = parseKey();
      key[COMMENTS].prefix = whitespace;
      whitespace = skipWhitespace();
      if (jsoncString[i] !== ":") {
        throw new Error(`Expected ':' at position ${i}`);
      }
      key[COMMENTS].suffix = whitespace;
      i++; // Consume ':'
      whitespace = skipWhitespace();
      const value = parseValue();
      const prop = new JSONCProperty(key, value);
      value[COMMENTS].prefix = whitespace;
      obj.properties.push(prop);

      prop[COMMENTS].suffix = skipWhitespace();
      if (jsoncString[i] === ",") {
        i++; // Consume ','
        whitespace = skipWhitespace();
        const newLine = whitespace.indexOf("\n");
        if (newLine !== -1) {
          prop[COMMENTS].endOfLine = whitespace.substring(0, newLine + 1);
          whitespace = whitespace.substring(newLine + 1);
        }
      } else if (prop[COMMENTS].suffix.includes("\n")) {
        const lines = prop[COMMENTS].suffix.split("\n");
        prop[COMMENTS].endOfLine = lines.shift() + "\n";
        prop[COMMENTS].suffix = "";
        obj[COMMENTS].suffix = lines.join("\n");
      }
    }

    if (i >= jsoncString.length || jsoncString[i] !== "}") {
      throw new Error(`Expected '}' at position ${i}`);
    }
    i++; // Consume '}'
    obj.computeFormatting();
    return obj;
  }

  /** Parse a JSONC array `[ ... ]` starting after the opening bracket. */
  function parseArray(): JSONCArray {
    const arr = new JSONCArray();
    i++; // Consume '['
    let whitespace = skipWhitespace();

    while (i < jsoncString.length && jsoncString[i] !== "]") {
      const value = parseValue();
      value[COMMENTS].prefix = whitespace;
      arr.elements.push(value!);

      whitespace = skipWhitespace();
      value[COMMENTS].suffix = whitespace;
      if (jsoncString[i] === ",") {
        i++; // Consume ','
        whitespace = skipWhitespace();
        const newLine = whitespace.indexOf("\n");
        if (newLine !== -1) {
          value[COMMENTS].endOfLine += whitespace.substring(0, newLine + 1);
          whitespace = whitespace.substring(newLine + 1);
        }
      } else if (value[COMMENTS].suffix.includes("\n")) {
        const lines = value[COMMENTS].suffix.split("\n");
        value[COMMENTS].endOfLine = lines.shift() + "\n";
        value[COMMENTS].suffix = "";
        arr[COMMENTS].suffix = lines.join("\n");
      }
    }

    if (i >= jsoncString.length || jsoncString[i] !== "]") {
      throw new Error(`Expected ']' at position ${i}`);
    }
    i++; // Consume ']'
    arr.computeFormatting();
    return arr;
  }

  /** Parse a double-quoted string literal and return it as a JSONCValue. */
  function parseString(): JSONCValue {
    let str = "";
    i++; // Consume '"'
    while (i < jsoncString.length && jsoncString[i] !== '"') {
      if (jsoncString[i] === "\\") {
        i++; // Consume '\'
        // Handle escape sequences if needed
      }
      str += jsoncString[i];
      i++;
    }
    if (i >= jsoncString.length || jsoncString[i] !== '"') {
      throw new Error(`Expected '"' at position ${i}`);
    }
    i++; // Consume '"'
    return new JSONCValue(str);
  }

  /** Parse a property key (quoted string) and return it as a JSONCKey. */
  function parseKey(): JSONCKey {
    const key = parseString();
    return new JSONCKey(key.value);
  }

  /** Parse a keyword literal (`true`, `false`, or `null`). */
  function parseKeyword(): JSONCValue {
    if (jsoncString.substring(i, i + 4) === "true") {
      i += 4;
      return new JSONCValue(true);
    } else if (jsoncString.substring(i, i + 5) === "false") {
      i += 5;
      return new JSONCValue(false);
    } else if (jsoncString.substring(i, i + 4) === "null") {
      i += 4;
      return new JSONCValue(null);
    } else {
      throw new Error(`Unexpected keyword at position ${i}`);
    }
  }

  /** Parse a numeric literal (integer, optionally negative). */
  function parseNumber(): JSONCValue {
    let numStr = "";
    if (jsoncString[i] === "-") {
      numStr += "-";
      i++;
    }
    while (i < jsoncString.length && jsoncString[i] >= "0" && jsoncString[i] <= "9") {
      numStr += jsoncString[i];
      i++;
    }
    // Handle decimals and exponents if needed
    return new JSONCValue(parseFloat(numStr));
  }

  /** Advance past whitespace and comments, returning the skipped text. */
  function skipWhitespace(): string {
    const start = i;
    let inStarComment = false;
    let inSlashComment = false;
    while (i < jsoncString.length) {
      // Skip we are in /* */ comments
      if (inStarComment) {
        if (jsoncString[i] === "*" && jsoncString[i + 1] === "/") {
          i += 2;
          inStarComment = false;
          continue;
        }
        i++;
        continue;
      }
      // Skip as we are in a // comment
      if (inSlashComment) {
        if (jsoncString[i] === "\n") {
          inSlashComment = false;
        }
        i++;
        continue;
      }
      // Start of a comment /*
      if (i < jsoncString.length - 2 && jsoncString[i] === "/" && jsoncString[i + 1] === "*") {
        i += 2;
        inStarComment = true;
        continue;
      }
      // Start of a comment //
      if (i < jsoncString.length - 2 && jsoncString[i] === "/" && jsoncString[i + 1] === "/") {
        i += 2;
        inSlashComment = true;
        continue;
      }
      // Skip whitespace
      if (!/\s/.test(jsoncString[i])) {
        break;
      }
      i++;
    }
    return jsoncString.substring(start, i);
  }
}

/**
 * JSON with Comments (JSONC) parser and serializer.
 *
 * Parses JSONC strings into comment-aware proxy objects that preserve comments and
 * whitespace when serialized back with `stringify`.
 */
export class JSONCParser {
  /**
   * Parse a JSONC string into a proxy object.
   *
   * The returned object behaves like a plain JavaScript object/array but retains
   * comment and whitespace metadata so that a subsequent `stringify` call reproduces
   * the original formatting.
   *
   * @param jsoncString - The JSONC source string to parse.
   * @returns A proxy object representing the parsed value.
   */
  static parse(jsoncString: string) {
    return parseJsoncToTree(jsoncString);
  }

  /**
   * Serialize a value to a string.
   *
   * If `tree` is a comment-aware proxy produced by `parse`, its original formatting
   * (including comments and whitespace) is preserved. Otherwise falls back to
   * `JSON.stringify`.
   *
   * @param tree - The value to serialize.
   * @param replacer - Optional replacer passed to `JSON.stringify` for non-proxy values.
   * @param space - Indentation for `JSON.stringify` fallback.
   * @returns The serialized string.
   */
  static stringify(tree: any, replacer?: (key: string, value: any) => any, space?: string | number): string {
    return tree instanceof JSONCNode || tree["$$target"] instanceof JSONCNode
      ? tree.toString()
      : JSON.stringify(tree, replacer, space);
  }
}
