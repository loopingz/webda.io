class JSONCNode {
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
  /**
   * Line comment after the {
   */
  $$startEndOfLine: string = "";
  /**
   * Comment to be
   */
  $$prefix: string = "";
  $$suffix: string = "";
  $$endOfLine: string = "";

  toProxy(): any {
    return this;
  }

  toJSON() {
    return this;
  }

  cloneComments(node: JSONCNode) {
    this.$$prefix = node.$$prefix;
    this.$$suffix = node.$$suffix;
    this.$$endOfLine = node.$$endOfLine;
  }
}

function stripComments(str: string) {
  return str.replace(/\/\*[\s\S]*?\*\//g, "");
}

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
      if (this.properties[ind].$$endOfLine.includes("\n")) {
        this.multiline = true;
      }
      const uncommented = stripComments(this.properties[ind].key.$$prefix).split("\n").pop().length;
      if (currentCount === -1) {
        currentCount = uncommented;
      } else if (currentCount !== uncommented) {
        // Cannot determine the indentation
        currentCount = -2;
      }
    }
    // By default use current object indentation + 2
    if (currentCount === -2) {
      this.indentation = 2 + stripComments(this.$$prefix.split("\n").pop()).length;
    } else {
      this.indentation = currentCount;
    }
  }

  addProperty(property: JSONCProperty) {
    property.key.$$prefix = " ".repeat(this.indentation);
    if (this.multiline) {
      property.$$endOfLine = "\n";
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

  toString(separator: string = "") {
    let res = this.$$prefix + "{" + this.$$startEndOfLine;
    for (let i = 0; i < this.properties.length; i++) {
      res += this.properties[i].toString(i < this.properties.length - 1 ? "," : "");
    }
    res += this.$$suffix + "}" + separator + this.$$endOfLine;
    return res;
  }

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

  toJSON() {
    const obj: any = {};
    this.properties.forEach(prop => {
      obj[prop.key.name] = prop.value.toJSON();
    });
    return obj;
  }
}

class JSONCValue extends JSONCNode {
  value: any;
  $$prefix = " ";

  constructor(value: any) {
    super();
    this.value = value;
  }

  toString(sep: string = "") {
    return this.$$prefix + JSON.stringify(this.value) + this.$$suffix + sep + this.$$endOfLine;
  }

  toProxy() {
    return this.value;
  }

  toJSON() {
    return this.value instanceof JSONCNode ? this.value.toJSON() : this.value;
  }
}

class JSONCProperty extends JSONCNode {
  key: JSONCKey;
  value: JSONCValue | JSONCObject | JSONCArray;

  constructor(key: JSONCKey, value: JSONCValue | JSONCObject | JSONCArray) {
    super();
    this.key = key;
    this.value = value;
  }

  toString(separator: string = "") {
    return (
      this.$$prefix + this.key.toString() + ":" + this.value.toString() + this.$$suffix + separator + this.$$endOfLine
    );
  }
}

class JSONCKey extends JSONCNode {
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  toString() {
    return this.$$prefix + `"${this.name}"` + this.$$suffix;
  }
}

class JSONCArrayProxy extends Array {
  constructor(private array: JSONCArray) {
    super();
    array.elements.forEach(el => {
      super.push(el.toProxy());
    });
  }

  push(...items: any[]): number {
    this.array.elements.push(...this.mapper(items));
    return super.push(...items);
  }

  pop(): any | undefined {
    this.array.elements.pop();
    return super.pop();
  }

  shift() {
    this.array.elements.shift();
    return super.shift();
  }

  mapper(items: any[]) {
    return items.map(item => this.array.computePrefix(JSONCNode.fromValue(item)));
  }

  unshift(...items: any[]): number {
    this.array.elements.unshift(...this.mapper(items));
    return super.unshift(...items);
  }

  splice(start: unknown, deleteCount?: unknown, ...rest: unknown[]): any[] {
    this.array.elements.splice(start as number, deleteCount as number, ...this.mapper(rest));
    return super.splice(start as number, deleteCount as number, ...rest);
  }
}

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

  computeFormatting() {
    // Keep with the default formatting
    if (this.elements.length === 0) {
      this.indentation = stripComments(this.$$prefix.split("\n").pop()).length + 2;
      return;
    }
    // Check if the properties are sorted
    this.multiline = false;
    let currentCount = -1;
    for (const ind in this.elements) {
      if (this.elements[ind].$$endOfLine.includes("\n")) {
        this.multiline = true;
      }
      const uncommented = stripComments(this.elements[ind].$$prefix).split("\n").pop().length;
      if (currentCount === -1) {
        currentCount = uncommented;
      } else if (currentCount !== uncommented) {
        // Cannot determine the indentation
        currentCount = -2;
      }
    }
    // By default use current object indentation + 2
    if (currentCount === -2) {
      this.indentation = 2 + stripComments(this.$$prefix.split("\n").pop()).length;
    } else {
      this.indentation = currentCount;
    }
  }

  computePrefix(property: JSONCObject | JSONCValue | JSONCArray) {
    if (this.multiline) {
      property.$$prefix = " ".repeat(this.indentation);
    } else {
      property.$$prefix = " ";
    }
    property.$$endOfLine = this.multiline ? "\n" : "";
    return property;
  }

  toString() {
    let res = this.$$prefix + "[";
    for (let i = 0; i < this.elements.length; i++) {
      res += this.elements[i].toString(i < this.elements.length - 1 ? "," : "");
    }
    res += this.$$suffix + "]" + this.$$endOfLine;
    return res;
  }

  toProxy() {
    return new JSONCArrayProxy(this);
  }

  toJSON() {
    return this.elements.map(el => el.toJSON());
  }
}

function parseJsoncToTree(jsoncString: string): any {
  let i = 0;
  const res = parseValue();
  return res instanceof JSONCNode ? res.toProxy() : res;

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
    value.$$prefix = prefix;
    if (first) {
      value.$$endOfLine += jsoncString.substring(i);
    }
    return value;
  }

  function parseObject(): JSONCObject {
    const obj = new JSONCObject();
    i++; // Consume '{'
    let whitespace = skipWhitespace();
    if (whitespace.includes("\n")) {
      const lines = whitespace.split("\n");
      obj.$$startEndOfLine = lines.shift() + "\n";
      whitespace = lines.join("\n");
    }

    while (i < jsoncString.length && jsoncString[i] !== "}") {
      const key = parseKey();
      key.$$prefix = whitespace;
      whitespace = skipWhitespace();
      if (jsoncString[i] !== ":") {
        throw new Error(`Expected ':' at position ${i}`);
      }
      key.$$suffix = whitespace;
      i++; // Consume ':'
      whitespace = skipWhitespace();
      const value = parseValue();
      const prop = new JSONCProperty(key, value);
      value.$$prefix = whitespace;
      obj.properties.push(prop);

      prop.$$suffix = skipWhitespace();
      if (jsoncString[i] === ",") {
        i++; // Consume ','
        whitespace = skipWhitespace();
        const newLine = whitespace.indexOf("\n");
        if (newLine !== -1) {
          prop.$$endOfLine = whitespace.substring(0, newLine + 1);
          whitespace = whitespace.substring(newLine + 1);
        }
      } else if (prop.$$suffix.includes("\n")) {
        const lines = prop.$$suffix.split("\n");
        prop.$$endOfLine = lines.shift() + "\n";
        prop.$$suffix = "";
        obj.$$suffix = lines.join("\n");
      }
    }

    if (i >= jsoncString.length || jsoncString[i] !== "}") {
      throw new Error(`Expected '}' at position ${i}`);
    }
    i++; // Consume '}'
    obj.computeFormatting();
    return obj;
  }

  function parseArray(): JSONCArray {
    const arr = new JSONCArray();
    i++; // Consume '['
    let whitespace = skipWhitespace();

    while (i < jsoncString.length && jsoncString[i] !== "]") {
      const value = parseValue();
      value.$$prefix = whitespace;
      arr.elements.push(value!);

      whitespace = skipWhitespace();
      value.$$suffix = whitespace;
      if (jsoncString[i] === ",") {
        i++; // Consume ','
        whitespace = skipWhitespace();
        const newLine = whitespace.indexOf("\n");
        if (newLine !== -1) {
          value.$$endOfLine += whitespace.substring(0, newLine + 1);
          whitespace = whitespace.substring(newLine + 1);
        }
      } else if (value.$$suffix.includes("\n")) {
        const lines = value.$$suffix.split("\n");
        value.$$endOfLine = lines.shift() + "\n";
        value.$$suffix = "";
        arr.$$suffix = lines.join("\n");
      }
    }

    if (i >= jsoncString.length || jsoncString[i] !== "]") {
      throw new Error(`Expected ']' at position ${i}`);
    }
    i++; // Consume ']'
    arr.computeFormatting();
    return arr;
  }

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

  function parseKey(): JSONCKey {
    const key = parseString();
    return new JSONCKey(key.value);
  }

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

export class JSONCParser {
  static parse(jsoncString: string) {
    return parseJsoncToTree(jsoncString);
  }

  static stringify(tree: any, replacer?: (key: string, value: any) => any, space?: string | number): string {
    return tree instanceof JSONCNode || tree["$$target"] instanceof JSONCNode
      ? tree.toString()
      : JSON.stringify(tree, replacer, space);
  }
}
