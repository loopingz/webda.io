import { Lambda } from "@aws-sdk/client-lambda";
import { AsyncAction, JobInfo, Runner, RunnerParameters } from "@webda/async";
import { AWSServiceParameters, loadAWSParameters } from "./aws-parameters.js";

export interface LambdaAsyncJobEvent {
  eventSource: string;
  jobInfo: JobInfo;
}

/**
 * LambdaCaller parameters
 */
export class LambdaCallerParameters extends RunnerParameters implements AWSServiceParameters {
  /**
   * Custom endpoint (localstack, minio, ...)
   */
  endpoint?: string;
  /**
   * Static credentials, default to the AWS environment variables
   */
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  /**
   * AWS region
   * @default "us-east-1"
   */
  region?: string;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    loadAWSParameters(this);
    return this;
  }

  /**
   * Default ARN to use
   */
  arn: string;
}

export interface LambdaCommandEvent {
  command: "launch";
  service: string;
  method: string;
  args?: any[];
}
/**
 * A service that calls a Lambda function and retrieve its result
 *
 * @WebdaModda
 */
export class LambdaCaller<T extends LambdaCallerParameters = LambdaCallerParameters> extends Runner<T> {
  /**
   * Launch the async action within the Lambda
   *
   * The Lambda receives a `launch` command calling the orchestrator
   * `runAsyncOperationAction` method with the job information
   * @param action - the action to launch
   * @param info - the job information
   * @returns the Lambda invocation result
   */
  launchAction(action: AsyncAction, info: JobInfo): Promise<any> {
    return this.execute(
      {
        command: "launch",
        service: info.JOB_ORCHESTRATOR,
        method: "runAsyncOperationAction",
        action,
        args: [info],
        // We also put the value in JOB_INFO for other type of runner
        JOB_INFO: info
      },
      true
    );
  }

  /**
   * Lambda client
   */
  protected client: Lambda;

  /**
   * Create the Lambda client
   * @returns this
   */
  resolve(): this {
    super.resolve();
    this.client = new Lambda(this.parameters);
    return this;
  }

  /**
   * Execute the Lambda function
   * @param params for the call
   * @param async wait for Lambda result
   * @param arn function to call default to the one from configuration
   * @returns the parsed Lambda payload
   */
  async execute(params: any = {}, async: boolean = false, arn = this.parameters.arn): Promise<any> {
    const res = await this.client.invoke({
      FunctionName: arn,
      ClientContext: undefined,
      InvocationType: async ? "Event" : "RequestResponse",
      LogType: "None",
      Payload: Buffer.from(JSON.stringify(params))
    });
    // An asynchronous invocation does not return any payload
    const payload = res.Payload ? Buffer.from(res.Payload).toString() : "";
    return payload ? JSON.parse(payload) : undefined;
  }
}

export default LambdaCaller;
