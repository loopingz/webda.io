import { createPropertyDecorator } from "@webda/tsc-esm";
import { truncate } from "fs/promises";

/**
 * Some simple annotations that can be used to add some behavior to attributes
 */
export const Masked = createPropertyDecorator((value: any, context, mask: string) => {
  if (context.kind === "field") {
    context.addInitializer(function (this: any) {
      const descriptor = Object.getOwnPropertyDescriptor(this, context.name) || {};
      Object.defineProperty(this, context.name, {
        ...descriptor,
        // eslint-disable-next-line
        get: function () {
          return this[`__${context.name}`];
        },
      // eslint-disable-next-line
      set: function (value) {
        value = value.padEnd(mask.length, "?");
        for (let i = 0; i < mask.length; i++) {
          if (mask[i] === "X") {
            value = value.substring(0, i) + "X" + value.substring(i + 1);
          } 
        }
        if (truncate) {
          value = value.substring(0, mask.length);
        }
        this[`__${context.name}`] = value;
      }
    });
  });
}});

export const Encrypted = createPropertyDecorator((value: any, context) => {
  if (context.kind === "field") {
    context.addInitializer(function (this: any) {
      const descriptor = Object.getOwnPropertyDescriptor(this, context.name) || {};
      Object.defineProperty(this, context.name, {
        ...descriptor,
        // eslint-disable-next-line
        get: function () {
          const val = this[`__${context.name}`];
          if (val && val.startsWith("ENCRYTPED:")) {
            return val.substring("ENCRYTPED:".length);
          }
          return val;
        },
      // eslint-disable-next-line
      set: function (value) {
        this[`__${context.name}`] = "ENCRYTPED:" + value;
      }
    });
  });
}});
