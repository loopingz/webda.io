import { Lambda } from "@aws-sdk/client-lambda";
import { AsyncAction, JobInfo, Runner, RunnerParameters } from "@webda/async";
import { ServiceParameters } from "@webda/core";
import { AWSServiceParameters } from "./aws-mixin";

export interface LambdaAsyncJobEvent {
  eventSource: string;
  jobInfo: JobInfo;
}

/**
 *
 */
class LambdaCallerParameters extends AWSServiceParameters(RunnerParameters) {
  /**
   * Default ARN to use
   */
  arn: string;
}

export interface LambdaCommandEvent {
  command: "launch";
  service: string;
  method: string;
  args?: string[];
}
/**
 * A service that calls a Lambda function and retrieve its result
 *
 * @WebdaModda
 */
class LambdaCaller<
  T extends LambdaCallerParameters = LambdaCallerParameters
> extends Runner<T> {
  /**
   * @inheritdoc
   */
  launchAction(action: AsyncAction, info: JobInfo): Promise<any> {
    // events.Records[0].eventSource
    // Use the AWSEvents framework
    return this.execute(
      {
        command: "launch",
        service: info.JOB_ORCHESTRATOR,
        method: "runWebdaAsyncAction",
        action,
        args: [info],
        // We also put the value in JOB_INFO for other type of runner
        JOB_INFO: info,
      },
      true
    );
  }

  /**
   * Lambda client
   */
  protected client: Lambda;

  /**
   * @inheritdoc
   */
  loadParameters(params: any): ServiceParameters {
    return new LambdaCallerParameters(params);
  }

  /**
   * @inheritdoc
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
   * @returns
   */
  async execute(
    params: any = {},
    async: boolean = false,
    arn = this.parameters.arn
  ): Promise<any> {
    return JSON.parse(
      (
        await this.client.invoke({
          FunctionName: arn,
          ClientContext: null,
          InvocationType: async ? "Event" : "RequestResponse",
          LogType: "None",
          Payload: Buffer.from(JSON.stringify(params)),
        })
      ).Payload.toString()
    );
  }
}

export { LambdaCaller };
