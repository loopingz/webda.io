import { Service, ServiceParameters } from "@webda/core";
import * as os from "os";
import { AsyncAction } from "../models";
import { JobInfo } from "./asyncjobservice";

export class RunnerParameters extends ServiceParameters {
  /**
   * Actions managed by the runner
   * @default []
   */
  actions?: string[];

  constructor(params: any) {
    super(params);
    this.actions ??= [];
  }
}

/**
 * Agent Information
 */
export interface AgentInfo {
  hostname: string;
  platform: string;
  release: string;
  memory: number;
  type: string;
}

/**
 * Node Agent information
 */
export interface NodeAgentInfo extends AgentInfo {
  nodeVersion: string;
}

/**
 * Runner take and launch an action
 */
export abstract class Runner<T extends RunnerParameters = RunnerParameters> extends Service<T> {
  /**
   * @inheritdoc
   */
  loadParameters(params: any): ServiceParameters {
    return new RunnerParameters(params);
  }
  /**
   * Handle this type of action
   * @param type
   * @returns
   */
  handleType(type: string): boolean {
    return this.parameters.actions?.includes(type) ?? false;
  }

  /**
   * Return agent information
   * @returns
   */
  static getAgentInfo(): AgentInfo {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      memory: os.totalmem(),
      type: os.type()
    };
  }
  /**
   * Launch the action
   * @param action
   */
  abstract launchAction(action: AsyncAction, info: JobInfo): Promise<any>;
}
