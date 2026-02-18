import * as yaml from "yaml";

const nodesMap = new WeakMap<any, any>();

/**
 * Utility class that load and serialize YAML data
 *
 * It return proxy objects that can be manipulated as regular objects
 * But that are linked to the original YAML data, so we can serialize them back
 * keeping the original comments and structure
 */
export class YAMLProxy {
  /**
   * Parse a YAML string into a comment-aware proxy object.
   *
   * Single-document strings return a single proxy; multi-document strings return an array of proxies.
   *
   * @param data - The YAML source string to parse.
   * @returns A proxy object (or array of proxies for multi-document YAML) retaining comment/whitespace metadata.
   */
  static parse(data: string): any {
    const docs = yaml.parseAllDocuments(data);
    if (docs.length === 1) {
      return new YAMLDocument(docs[0]).getProxy();
    }
    return docs.map(d => new YAMLDocument(d).getProxy());
  }

  /**
   * Serialize a value back to a YAML string.
   *
   * If `obj` is a `YAMLProxy` instance, its original formatting and comments are preserved.
   * Arrays are joined with `\n---\n` (multi-document). Plain objects/values fall back to `yaml.stringify`.
   *
   * @param obj - The value to serialize.
   * @returns The YAML string representation.
   */
  static stringify(obj: any): string {
    if (obj instanceof YAMLProxy) {
      return obj.toString();
    } else if (Array.isArray(obj)) {
      return obj.map(o => YAMLProxy.stringify(o)).join("\n---\n");
    }
    return yaml.stringify(obj);
  }
}

interface YAMLProxies {
  getProxy(): any;
  clone(): any;
}

function getYAMLNode(item) {
  if (yaml.isScalar(item)) {
    return item.value;
  } else if (yaml.isSeq(item)) {
    return new YAMLArray(item as any).getProxy();
  } else if (yaml.isMap(item)) {
    return new YAMLMap(item).getProxy();
  }
}

function createYAMLNode(item) {
  if (item instanceof YAMLArray || item instanceof YAMLMap) {
    return item.clone();
  }
  if (Array.isArray(item)) {
    const seq = new yaml.YAMLSeq();
    item.forEach(i => seq.items.push(createYAMLNode(i)));
    return seq;
  } else if (typeof item === "object") {
    const map = new yaml.YAMLMap();
    Object.entries(item).forEach(([key, value]) => {
      map.items.push(new yaml.Pair(new yaml.Scalar(key), createYAMLNode(value)));
    });
    return map;
  } else {
    return new yaml.Scalar(item);
  }
}

function setYAMLNodes(target, node) {
  node?.items.forEach(attr => {
    if (yaml.isScalar(attr.value)) {
      target[attr.key.value] = attr.value.value;
    } else if (yaml.isSeq(attr.value)) {
      target[attr.key.value] = new YAMLArray(attr);
      //this[attr.key.value] = new YAMLArray(attr);
    } else if (yaml.isMap(attr.value)) {
      target[attr.key.value] = new YAMLMap(attr);
    }
  });
}

/**
 * YAML Array Proxy
 */
class YAMLArray<T> extends Array<T> implements YAMLProxies {
  static get [Symbol.species]() {
    return Array;
  }

  constructor(doc: yaml.Pair) {
    super();
    nodesMap.set(this, doc);
    (<yaml.YAMLSeq>doc.value).items.forEach(item => {
      super.push(getYAMLNode(item) as any);
    });
  }

  push(...items: any[]): number {
    nodesMap.get(this).value.items.push(...items.map(createYAMLNode));
    return super.push(...items);
  }

  clone() {
    return nodesMap.get(this).value.clone();
  }

  pop(): T {
    nodesMap.get(this).value.items.pop();
    return super.pop();
  }

  shift(): T {
    nodesMap.get(this).value.items.shift();
    return super.shift();
  }

  unshift(...items: T[]): number {
    nodesMap.get(this).value.items.unshift(...items.map(createYAMLNode));
    return super.unshift(...items);
  }

  splice(start: number, deleteCount?: number, ...items: T[]): T[] {
    nodesMap.get(this).value.items.splice(start, deleteCount, ...items.map(createYAMLNode));
    return super.splice(start, deleteCount, ...items);
  }

  getProxy() {
    return this;
  }

  toJSON() {
    return nodesMap.get(this).toJSON();
  }
}

/**
 * YAML Map Proxy
 */
class YAMLMap implements YAMLProxies {
  constructor(doc: any) {
    nodesMap.set(this, doc);
    this.setYAMLNodes(doc);
  }

  setYAMLNodes(doc) {
    setYAMLNodes(this, doc.value);
  }

  getYAMLNodes() {
    return nodesMap.get(this).value;
  }

  clone() {
    const source = nodesMap.get(this["$$target"] || this);
    return source.value.clone();
  }

  getProxy(): any {
    return new Proxy(this, {
      get(target, prop) {
        if (prop === "toString") {
          return () => nodesMap.get(target).toString();
        }
        if (prop === "$$target") {
          return target;
        }
        if (target[prop] && typeof target[prop].getProxy === "function") {
          return target[prop].getProxy();
        }
        return target[prop];
      },
      set(target, prop, value) {
        if (!target[prop]) {
          const newValue = createYAMLNode(value);
          target.getYAMLNodes().items.push(new yaml.Pair(new yaml.Scalar(prop), newValue));
        } else {
          target.getYAMLNodes().items.forEach((attr, ind) => {
            if (attr.key.value === prop) {
              attr.value = createYAMLNode(value);
            }
          });
        }
        target[prop] = value;
        return true;
      },
      deleteProperty(target, prop) {
        target.getYAMLNodes().items = target.getYAMLNodes().items.filter(attr => attr.key.value !== prop);
        delete target[prop];
        return true;
      }
    });
  }
  toJSON() {
    return nodesMap.get(this["$$target"] || this).toJSON();
  }
}

/**
 * YAML Document Proxy
 */
class YAMLDocument extends YAMLMap {
  setYAMLNodes(doc) {
    setYAMLNodes(this, doc.contents);
  }

  getYAMLNodes() {
    return nodesMap.get(this).contents;
  }
}
