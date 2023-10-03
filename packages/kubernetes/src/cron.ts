import { Application, CronDefinition } from "@webda/core";

/**
 * Replaces placeholders in a given template string with values from a CronDefinition object and other replacements.
 * 
 * Cron Arguments are rendered in 3 different ways:
 *  - argsLine: The arguments are rendered as a single string, with each argument wrapped in double quotes and separated by a space.
 *  - argsLineSingleQuote: The arguments are rendered as a single string, with each argument wrapped in single quotes and separated by a space.
 *  - argsArray: The arguments are rendered as a single string, with each argument wrapped in double quotes and separated by a comma.
 * 
 * @param template - The template string to replace placeholders in.
 * @param cron - The CronDefinition object containing values to replace placeholders with.
 * @param app - The Application object.
 * @param replacements - Optional additional replacements to use in the template string.
 * @returns The template string with all placeholders replaced with their corresponding values.
 */
export function CronReplace(template: string | any, cron: CronDefinition, app: Application, replacements: any = {}) {
  const cleanVars = (value: string) => {
    // @deprecated remove in > 4.x
    value = value.replace(/"\${...cron\.args}"/g, "${cron.argsArray}");
    // Handle special case for args
    value = value.replace(/"\${cron\.argsArray}",?/g, "${cron.argsArray}");
    value = value.replace(/"\${cron\.argsLine}"/g, "${cron.argsLine}");
    value = value.replace(/'\${cron\.argsLine}'/g, "${cron.argsLineSingleQuote}");
    return value;
  }
  if (typeof template === "string") {
    template = cleanVars(template);
  } else {
    template = JSON.parse(JSON.stringify(template, (_, value) => {
      // Remove the last element of the array if it is "${...cron.args}"
      if (Array.isArray(value) && value[value.length-1] === "${...cron.args}") {
        value.pop();
        value.push(...cron.args);
      } else if (typeof value === "string") {
        return cleanVars(value);
      }
      return value;
    }));
  }

  return app.replaceVariables(template,
    {
      ...replacements,
      env: process.env,
      cron: {
        ...cron,
        // For future usage
        argsb64: Buffer.from(JSON.stringify(cron.args)).toString("base64"),
        // Useful for passing the argument to the command line
        argsLine: cron.args.map(p => `"${p}"`).join(" "),
        argsLineSingleQuote: cron.args.map(p => `'${p}'`).join(" "),
        argsArray: cron.args.map(p => `"${p}"`).join(", ")
      }
    }
  );
}
