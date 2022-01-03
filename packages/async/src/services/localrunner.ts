import { AgentInfo, Runner, RunnerParameters } from "./runner";
import { AsyncAction } from "../models";
import { spawn, SpawnOptions } from "child_process";
import { ServiceParameters } from "@webda/core";
import { JobInfo } from "./asyncjobservice";

export class LocalRunnerParameters extends RunnerParameters {
  /**
   * Command to launch
   */
  command: string;
  /**
   * Args
   */
  args?: string[];
  /**
   * Options
   *
   * Based on https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
   */
  options?: SpawnOptions;
  /**
   * Use the observability of ChildProcess to update status accordingly
   */
  autoStatus?: boolean;

  constructor(params: any) {
    super(params);
    this.options ??= {};
    this.options.env ??= {};
  }
}

/**
 * Type of action returned by LocalRunner
 */
export interface ProcessAction {
  agent: AgentInfo;
  pid: number;
}

/**
 * Run a Job locally on the server by spawning a child process
 */
export default class LocalRunner<T extends LocalRunnerParameters = LocalRunnerParameters> extends Runner<T> {
  /**
   * @inheritdoc
   */
  loadParameters(params: any): ServiceParameters {
    return new LocalRunnerParameters(params);
  }

  /**
   * @inheritdoc
   */
  async launchAction(action: AsyncAction, info: JobInfo): Promise<ProcessAction> {
    let envs = {
      ...this.parameters.options.env,
      ...info
    };
    this.log("INFO", "Job", action.getUuid(), "started with", this.parameters.command, this.parameters.args);
    const child = spawn(this.parameters.command, this.parameters.args, {
      ...this.parameters.options,
      env: envs,
      detached: true
    });

    // AutoStatus based on process info
    if (this.parameters.autoStatus) {
      child.stdout.on("data", data => {
        action.getStore().upsertItemToCollection(action.getUuid(), "logs", data);
      });
      child.stderr.on("data", data => {
        action.getStore().upsertItemToCollection(action.getUuid(), "logs", data);
      });
      // As this is local just and mostly used for batch auto status it
      await action.getStore().patch({ uuid: action.getUuid(), status: "RUNNING" });
      child.on("exit", async code => {
        if (code !== 0) {
          this.log("INFO", "Job", action.getUuid(), "errored with", code);
          await action.getStore().patch({ uuid: action.getUuid(), status: "ERROR" });
        } else {
          this.log("INFO", "Job", action.getUuid(), "successful");
          await action.getStore().patch({ uuid: action.getUuid(), status: "SUCCESS" });
        }
      });
    }

    return {
      agent: Runner.getAgentInfo(),
      pid: child.pid
    };
  }

  /**
   * @inheritdoc
   */
  static getModda() {
    return {
      uuid: "Webda/LocalRunner",
      label: "Local Runner",
      description: "Implements a runner that launch a local program"
    };
  }
}