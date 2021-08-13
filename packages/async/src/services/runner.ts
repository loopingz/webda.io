import { ServiceParameters, Service } from "@webda/core";
import { AsyncAction } from "../models";

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
    return this.parameters.actions.includes(type);
  }
  /**
   * Launch the action
   * @param action
   */
  abstract launchAction(action: AsyncAction): Promise<any>;
}
