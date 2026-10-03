import { Service, ServiceParameters } from "@webda/core";
import * as os from "node:os";
import type { AsyncAction } from "../asyncaction.model.js";
import type { JobInfo } from "./asyncjobservice.service.js";

/**
 * Runner parameters
 */
export class RunnerParameters extends ServiceParameters {
  /**
   * Actions managed by the runner
   * @default []
   */
  actions?: string[];

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.actions ??= [];
    return this;
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
   * Handle this type of action
   * @param type - the action type
   * @returns true if the runner handles it
   */
  handleType(type: string): boolean {
    return this.parameters.actions?.includes(type) ?? false;
  }

  /**
   * Return agent information
   * @returns the agent information
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
   * @param action - the action to launch
   * @param info - the job information
   */
  abstract launchAction(action: AsyncAction, info: JobInfo): Promise<any>;
}
