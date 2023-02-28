import { ServiceParameters } from "@webda/core";

// To get started, we need a type which we'll use to extend
// other classes from. The main responsibility is to declare
// that the type being passed in is a class.

type Constructor<T extends ServiceParameters = ServiceParameters> = new (
  ...args: any[]
) => T;

export interface IAWSServiceParameters {
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region?: string;
}
// This mixin adds a scale property, with getters and setters
// for changing it with an encapsulated private property:

export function AWSServiceParameters<TBase extends Constructor>(Base: TBase) {
  return class AWSServiceParametersMixin
    extends Base
    implements IAWSServiceParameters
  {
    // Mixins may not declare private/protected properties
    // however, you can use ES2020 private fields
    endpoint?: string;
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    };
    region?: string;

    constructor(...args: any[]) {
      super(...args);
      this.region =
        this.region || process.env["AWS_DEFAULT_REGION"] || "us-east-1";
      if (
        process.env["AWS_ACCESS_KEY_ID"] &&
        process.env["AWS_SECRET_ACCESS_KEY"] &&
        !process.env["ECS_CLUSTER"]
      ) {
        this.credentials ??= {
          accessKeyId: process.env["AWS_ACCESS_KEY_ID"],
          secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"],
          sessionToken: process.env["AWS_SESSION_TOKEN"],
        };
      }
    }
  };
}
