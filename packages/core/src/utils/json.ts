export const JSONUtils = {
  stringify: (value, replacer: (key: string, value: any) => any = undefined, space: number | string = 2) => {
    let stringified = [];
    return JSON.stringify(
      value,
      function(key: string, value: any): any {
        if ((stringified.indexOf(value) >= 0 && typeof value === "object") || key.startsWith("__")) {
          return undefined;
        }
        stringified.push(value);
        if (replacer) {
          return replacer.bind(this, key, value)();
        }
        return value;
      },
      space
    );
  },
  parse: value => {
    // Auto clean any noise
    return JSON.parse(value);
  },
  duplicate: value => {
    return JSON.parse(JSONUtils.stringify(value));
  }
};
