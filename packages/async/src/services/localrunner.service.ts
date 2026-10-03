import { spawn, SpawnOptions } from "node:child_process";
import type { AsyncAction } from "../asyncaction.model.js";
import type { JobInfo } from "./asyncjobservice.service.js";
import { AgentInfo, Runner, RunnerParameters } from "./runner.service.js";

/**
 * LocalRunner parameters
 */
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

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.options ??= {};
    this.options.env ??= {};
    return this;
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
 *
 * @WebdaModda
 */
export default class LocalRunner<T extends LocalRunnerParameters = LocalRunnerParameters> extends Runner<T> {
  /**
   * Spawn the process
   * @param command - the command
   * @param args - the arguments
   * @param options - the spawn options
   * @returns the child process
   */
  spawn(command: string, args: string[], options?: SpawnOptions | undefined) {
    /* c8 ignore next 2 */
    return spawn(command, args, options);
  }

  /**
   * @inheritdoc
   * @param action - the action to launch
   * @param info - the job information
   * @returns the process information
   */
  async launchAction(action: AsyncAction, info: JobInfo): Promise<ProcessAction> {
    const envs: { [key: string]: string } = {
      ...this.parameters.options?.env,
      ...info
    };
    this.log(
      "INFO",
      "Job",
      action.uuid,
      "started with",
      Object.keys(envs)
        .map(k => `${k}=${envs[k]}`)
        .join(" "),
      this.parameters.command,
      this.parameters.args ? this.parameters.args.map(a => `'${a}'`).join(" ") : ""
    );
    const child = this.spawn(this.parameters.command, this.parameters.args || [], {
      ...this.parameters.options,
      env: envs,
      detached: true
    });

    // AutoStatus based on process info
    if (this.parameters.autoStatus && child) {
      const repository = action.getRepository();
      // Chain the writes so concurrent output does not lose lines
      let logs: Promise<void> = Promise.resolve();
      const addLog = data => {
        logs = logs.then(() => repository.upsertItemToCollection(action.uuid, "logs", data.toString()));
        return logs;
      };
      child.stdout?.on("data", addLog);
      child.stderr?.on("data", addLog);
      // As this is local just and mostly used for batch auto status it
      await repository.patch(action.uuid, { status: "RUNNING" });
      child.on("exit", async code => {
        if (code !== 0) {
          this.log("INFO", "Job", action.uuid, "errored with", code);
          await repository.patch(action.uuid, { status: "ERROR" });
        } else {
          this.log("INFO", "Job", action.uuid, "successful");
          await repository.patch(action.uuid, { status: "SUCCESS" });
        }
      });
    }

    return {
      agent: Runner.getAgentInfo(),
      pid: child?.pid || -1
    };
  }
}

export { LocalRunner };
