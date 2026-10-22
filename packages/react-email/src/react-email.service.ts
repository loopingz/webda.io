import { BuildCommand, Command, Service, ServiceParameters, useLog } from "@webda/core";
import "./engine.js";
import { precompile, type PrecompileResult } from "./precompile.js";

/**
 * Parameters of the {@link ReactEmailService}
 */
export class ReactEmailParameters extends ServiceParameters {
  /**
   * Folder containing the emails, relative to the working directory
   * @default "./emails"
   */
  source?: string;
  /**
   * Folder where the mustache templates are written, relative to the working directory
   * @default "./templates"
   */
  output?: string;
  /**
   * Pretty print the html
   * @default true
   */
  pretty?: boolean;
  /**
   * Replace `&#x27;` by `'` in the html
   * @default true
   */
  fixApostrophes?: boolean;
  /**
   * Source to compiled prefix map, for example `{ "emails/": "lib/emails/" }`
   */
  sourceMap?: Record<string, string>;

  /**
   * @param params - raw parameters
   * @returns this with the defaults
   */
  load(params: any = {}): this {
    super.load(params);
    this.source ??= "./emails";
    this.output ??= "./templates";
    this.pretty ??= true;
    this.fixApostrophes ??= true;
    return this;
  }
}

/**
 * Exit code of a precompile run
 * @param result - the precompile result
 * @returns 1 when a template failed, otherwise 0
 */
function exitCode(result: PrecompileResult): number {
  return result.failed.length > 0 ? 1 : 0;
}

/**
 * Precompile the react-email templates to mustache
 *
 * `webdac build` runs it through the build hook, `webda react-email build` on demand.
 *
 * @WebdaModda
 */
export class ReactEmailService<T extends ReactEmailParameters = ReactEmailParameters> extends Service<T> {
  /**
   * @param params - raw service parameters
   * @returns the parameters
   */
  static createConfiguration(params: any = {}): ReactEmailParameters {
    return new ReactEmailParameters().load(params);
  }

  /**
   * Generate `<output>/<name>/{html,text,subject}.mustache` from `<source>/<name>/email.tsx`
   *
   * @returns 1 when a template failed, otherwise 0
   */
  @BuildCommand({ description: "Precompile react-email templates to mustache" })
  async build(): Promise<number> {
    const result = await precompile(this.parameters);
    this.log("INFO", `react-email: ${result.generated.length} template(s) generated`);
    return exitCode(result);
  }

  /**
   * Precompile the react-email templates to mustache
   *
   * @param source - folder of the email components
   * @param output - folder of the generated mustache templates
   * @param pretty - format the generated html
   * @returns 1 when a template failed, otherwise 0
   */
  @Command("react-email build", { description: "Precompile react-email templates to mustache", phase: "application" })
  static async buildTemplates(
    /** @alias s @description Folder of the email components */
    source: string = "./emails",
    /** @alias o @description Folder of the generated mustache templates */
    output: string = "./templates",
    /** @description Format the generated html */
    pretty: boolean = true
  ): Promise<number> {
    const result = await precompile({ source, output, pretty });
    useLog("INFO", `react-email: ${result.generated.length} template(s) generated`);
    return exitCode(result);
  }
}

declare module "@webda/core" {
  interface ServicesMap {
    ReactEmailService: ReactEmailService;
  }
}
