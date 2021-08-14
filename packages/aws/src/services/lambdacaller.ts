"use strict";
import { ServiceParameters, Service, ModdaDefinition } from "@webda/core";
import * as AWS from "aws-sdk";

/**
 *
 */
class LambdaCallerParameters extends ServiceParameters {
  /**
   * Default ARN to use
   */
  arn: string;
}

/**
 * A service that calls a Lambda function and retrieve its result
 */
class LambdaCaller<T extends LambdaCallerParameters = LambdaCallerParameters> extends Service<T> {

  /**
   * Lambda client
   */
  protected client: AWS.Lambda;

  /**
   * @inheritdoc
   */
  loadParameters(params: any) : ServiceParameters {
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
    return (await  this.client.invoke({
      FunctionName: arn,
      ClientContext: null,
      InvocationType:async ? "Event" : "RequestResponse",
      LogType: "None",
      Payload: JSON.stringify(params)
    }).promise()).$response.data;
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
