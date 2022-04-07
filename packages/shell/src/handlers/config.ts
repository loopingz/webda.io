import {
  Application,
  Configuration,
  Context,
  RequestFilter,
  SectionEnum,
  Service,
  ServiceConstructor
} from "@webda/core";
import * as path from "path";
import { Deployment } from "../models/deployment";
import { WebdaServer } from "./http";

/**
 * @WebdaModda webdashell/configuration
 */
export default class ConfigurationService extends Service implements RequestFilter<Context> {
  webdaApplication: Application;

  async checkRequest(context: Context): Promise<boolean> {
    if (context.getHttpContext().getHeader("origin") === "localhost:18181") {
      return true;
    }
    return false;
  }

  resolve() {
    super.resolve();
    this._webda.registerRequestFilter(this);
    this.addRoute("/configuration", ["GET", "PUT"], this.crudConfiguration);
    this.addRoute("/application", ["GET"], this.getApplication);
    this.addRoute("/npm", ["POST"], this.npmSearch);
    this.addRoute("/npm/search", ["POST"], this.npmSearch);
    this.addRoute("/webda", ["GET"], this.getWebdaVersions);
    this.addRoute("/openapi", ["GET"], this.crudConfiguration);
  }

  async init() {
    await super.init();
    this.webdaApplication = (<WebdaConfiguration>this._webda).getWebdaApplication();
  }

  async crudConfiguration(ctx: Context) {
    if (ctx.getHttpContext().getMethod() === "GET") {
      ctx.write(this.webdaApplication.getConfiguration());
    } else if (ctx.getHttpContext().getMethod() === "PUT") {
      ctx.write("Will write webda.config.json");
    }
  }

  /**
   * Return webda Core and Shell version
   *
   * @param ctx
   */
  async getWebdaVersions(ctx: Context) {
    ctx.write({
      Core: this._webda.getApplication(),
      Shell: this.webdaApplication.getPackageDescription().version
    });
  }

  async npmSearch(ctx: Context) {
    ctx.write({});
  }

  async getApplication(ctx: Context) {
    ctx.write(this.webdaApplication);
  }
}
export { ConfigurationService };

export class ConfigApplication extends Application {
  getModel(model: string): any {
    if (model.toLowerCase() === "webdaconfiguration/deployment") {
      return Deployment;
    }
    return super.getModel(model);
  }

  getModda(name: string): ServiceConstructor<Service> {
    if (name.toLowerCase() === "webdaconfiguration/api") {
      return ConfigurationService;
    }
    return super.getModda(name);
  }

  constructor(application: Application) {
    super(application.getAppPath());
    Object.values(SectionEnum).forEach(section => {
      this[section] = application[section];
    });
  }

  getConfiguration(_deploymentName: string = undefined): Configuration {
    return {
      version: 3,
      parameters: {
        sessionSecret:
          "qwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqazqwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqazqwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqazqwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqazqwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqazqwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqazqwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqaz"
      },
      services: {
        api: {
          type: "WebdaConfiguration/API"
        },
        logger: {
          type: "Webda/FileLogger",
          logLevel: "INFO",
          file: "/tmp/.webda.config.log"
        },
        deployments: {
          type: "Webda/FileStore",
          folder: path.join(this.getAppPath(), "deployments"),
          model: "WebdaConfiguration/Deployment",
          lastUpdate: false,
          beautify: " ",
          expose: {
            url: "/deployments"
          }
        }
      }
    };
  }
}

export class WebdaConfiguration extends WebdaServer {
  webdaApplication: Application;

  constructor(application: Application) {
    super(new ConfigApplication(application));
    this.webdaApplication = application;
  }

  getWebdaApplication(): Application {
    return this.webdaApplication;
  }

  async serve() {
    return super.serve(18181, true);
  }
}
