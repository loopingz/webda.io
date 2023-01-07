import { Application, CronDefinition } from "@webda/core";

export function CronReplace(template: any, cron: CronDefinition, app: Application, replacements: any = {}) {
  return app.replaceVariables(
    JSON.parse(
      JSON.stringify(template, function (key: string, value: any): any {
        if (Array.isArray(value)) {
          // Search for args spread keyword
          if (value[value.length - 1] === "${...cron.args}") {
            let newValue = [...value];
            newValue.pop();
            newValue.push(...cron.args);
            return newValue;
          }
        }
        return value;
      })
    ),
    {
      ...replacements,
      env: process.env,
      cron: {
        ...cron,
        // For future usage
        argsb64: Buffer.from(JSON.stringify(cron.args)).toString("base64"),
        // Useful for passing the argument to the command line
        argsLine: cron.args.map(p => `"${p}"`).join(", ")
      }
    }
  );
}
