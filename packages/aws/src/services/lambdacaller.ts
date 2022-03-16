import { ServiceParameters } from "@webda/core";
import { AsyncAction, Runner, RunnerParameters, JobInfo } from "@webda/async";
import * as AWS from "aws-sdk";

export interface LambdaAsyncJobEvent {
  eventSource: string;
  jobInfo: JobInfo;
}

/**
 *
 */
class LambdaCallerParameters extends RunnerParameters {
  /**
   * Default ARN to use
   */
  arn: string;
}

/**
 * A service that calls a Lambda function and retrieve its result
 *
 * @WebdaModda
 */
class LambdaCaller<T extends LambdaCallerParameters = LambdaCallerParameters> extends Runner<T> {
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
  protected client: AWS.Lambda;

  /**
   * @inheritdoc
   */
  loadParameters(params: any): ServiceParameters {
    return new LambdaCallerParameters(params);
  }

  /**
   * @inheritdoc
   */
  resolve() {
    super.resolve();
    this.client = new AWS.Lambda();
  }

  /**
   * Execute the Lambda function
   * @param params for the call
   * @param async wait for Lambda result
   * @param arn function to call default to the one from configuration
   * @returns
   */
  async execute(params: any = {}, async: boolean = false, arn = this.parameters.arn) {
    return (
      await this.client
        .invoke({
          FunctionName: arn,
          ClientContext: null,
          InvocationType: async ? "Event" : "RequestResponse",
          LogType: "None",
          Payload: JSON.stringify(params)
        })
        .promise()
    ).$response.data;
  }
}

export { LambdaCaller };
