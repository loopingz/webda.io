import { ServiceParameters } from "@webda/core";

export function InjectAWSParameters(params: IAWSServiceParameters): IAWSServiceParameters {
  if (!params.accessKeyId && !process.env["ECS_CLUSTER"]) {
    // If in ECS_CLUSTER then rely on metadata service
    params.accessKeyId = process.env["AWS_ACCESS_KEY_ID"];
    params.secretAccessKey = process.env["AWS_SECRET_ACCESS_KEY"];
    params.sessionToken = process.env["AWS_SESSION_TOKEN"];
  }
  params.region = params.region || process.env["AWS_DEFAULT_REGION"] || "us-east-1";
  let update: any = {
    region: params.region
  };
  return params;
}

// To get started, we need a type which we'll use to extend
// other classes from. The main responsibility is to declare
// that the type being passed in is a class.

type Constructor<T extends ServiceParameters = ServiceParameters> = new (...args: any[]) => T;

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
  return class AWSServiceParameters extends Base implements IAWSServiceParameters {
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
    }
  };
}
