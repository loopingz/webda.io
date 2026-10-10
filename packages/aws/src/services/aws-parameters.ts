import { SecretString } from "@webda/core";

/**
 * AWS client parameters shared by the AWS services
 *
 * Each service parameters class declares these fields and calls
 * {@link loadAWSParameters} from its `load()` override
 */
export interface AWSServiceParameters {
  /**
   * Custom endpoint (localstack, minio, ...)
   */
  endpoint?: string;
  /**
   * Static credentials, default to the AWS environment variables
   *
   * Can be encrypted with `webda config encrypt`
   */
  credentials?: {
    accessKeyId: string | SecretString;
    secretAccessKey: string | SecretString;
    sessionToken?: string | SecretString;
  };
  /**
   * AWS region
   * @default "us-east-1"
   */
  region?: string;
}

/**
 * Default the region and credentials from the AWS environment variables
 *
 * @param params - the parameters to complete
 * @returns the parameters
 */
export function loadAWSParameters<T extends AWSServiceParameters>(params: T): T {
  params.region ??= process.env["AWS_DEFAULT_REGION"] || "us-east-1";
  if (process.env["AWS_ACCESS_KEY_ID"] && process.env["AWS_SECRET_ACCESS_KEY"] && !process.env["ECS_CLUSTER"]) {
    params.credentials ??= {
      accessKeyId: process.env["AWS_ACCESS_KEY_ID"],
      secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"],
      sessionToken: process.env["AWS_SESSION_TOKEN"]
    };
  }
  return params;
}

/**
 * Build the configuration to pass to an AWS SDK client constructor
 *
 * The credentials can hold {@link SecretString} values (encrypted configuration):
 * they are replaced by their plain value in a shallow copy, the parameters
 * themselves keep the masked secrets.
 *
 * @param params - the service parameters
 * @returns the client configuration
 */
export function getAWSClientConfig<T extends AWSServiceParameters>(params: T): any {
  const credentials = params.credentials;
  if (!credentials || !Object.values(credentials).some(v => v instanceof SecretString)) {
    return params;
  }
  return { ...params, credentials: SecretString.unwrap({ ...credentials }) };
}
