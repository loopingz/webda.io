"use strict";
import { ModdaDefinition, ServiceParameters } from "@webda/core";
import { AsyncAction, Runner, RunnerParameters, JobInfo, AsyncJobService } from "@webda/async";
import * as AWS from "aws-sdk";
import LambdaServer, { AWSEventsHandler } from "./lambdaserver";

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
 */
class LambdaCaller<T extends LambdaCallerParameters = LambdaCallerParameters>
  extends Runner<T>
  implements AWSEventsHandler
{
  static EventSource = "webda:lambdajob";
  /**
   * @inheritdoc
   */
  isAWSEventHandled(source: string, events: any): boolean {
    return source === LambdaCaller.EventSource;
  }

  /**
   * @inheritdoc
   */
  async handleAWSEvent(source: string, events: any): Promise<void> {
    const event: LambdaAsyncJobEvent = <LambdaAsyncJobEvent>events.Records.shift();
    return this.getService<AsyncJobService>(event.jobInfo.JOB_ORCHESTRATOR).runWebdaAsyncAction(event.jobInfo);
  }

  /**
   * @inheritdoc
   */
  launchAction(action: AsyncAction, info: JobInfo): Promise<any> {
    // events.Records[0].eventSource
    // Use the AWSEvents framework
    return this.execute(
      {
        events: {
          Records: [
            <LambdaAsyncJobEvent>{
              eventSource: LambdaCaller.EventSource,
              jobInfo: info
            }
          ]
        }
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
    if (this.getWebda() instanceof LambdaServer) {
      (<LambdaServer>this.getWebda()).registerAWSEventsHandler(this);
    }
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

  /**
   * @inheritdoc
   */
  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/LambdaCaller",
      label: "LambdaCaller",
      description: "Call a Lambda function and give result"
    };
  }
}

export { LambdaCaller };
