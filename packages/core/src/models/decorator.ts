import { createPropertyDecorator } from "@webda/tsc-esm";
import { truncate } from "fs/promises";

/**
 * Some simple annotations that can be used to add some behavior to attributes
 */
export const Masked = createPropertyDecorator((value: any, context, mask: string) => {
  if (context.kind === "field") {
    context.addInitializer(function maskedInit(this: any) {
      const descriptor = Object.getOwnPropertyDescriptor(this, context.name) || {};
      Object.defineProperty(this, context.name, {
        ...descriptor,
         
        get: function maskedGet() {
          return this[`__${context.name}`];
        },
         
        set: function maskedSet(value) {
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
  }
});

export const Encrypted = createPropertyDecorator((value: any, context) => {
  if (context.kind === "field") {
    context.addInitializer(function encryptedInit(this: any) {
      const descriptor = Object.getOwnPropertyDescriptor(this, context.name) || {};
      Object.defineProperty(this, context.name, {
        ...descriptor,
         
        get: function encryptedGet() {
          const val = this[`__${context.name}`];
          if (val && val.startsWith("ENCRYPTED:")) {
            return val.substring("ENCRYPTED:".length);
          }
          return val;
        },
         
        set: function encryptedSet(value) {
          this[`__${context.name}`] = "ENCRYPTED:" + value;
        }
      });
    });
  }
});
