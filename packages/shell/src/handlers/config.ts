import {
  Application,
  Configuration,
  Context,
  RequestFilter,
  Service,
  ServiceConstructor
} from "@webda/core";
import * as path from "path";
import { Deployment } from "../models/deployment";
import { WebdaServer } from "./http";

export default class ConfigurationService extends Service
  implements RequestFilter {
  webdaApplication: Application;

  async checkRequest(context: Context): Promise<boolean> {
    if (context.getHttpContext().root === "http://localhost:18181") {
      return true;
    }
    return false;
  }

  resolve() {
    super.resolve();
    this._webda.registerRequestFilter(this);
    this._addRoute("/configuration", ["GET", "PUT"], this.crudConfiguration);
    this._addRoute("/application", ["GET"], this.getApplication);
    this._addRoute("/npm", ["POST"], this.npmSearch);
    this._addRoute("/npm/search", ["POST"], this.npmSearch);
    this._addRoute("/webda", ["GET"], this.getWebdaVersions);
  }

  async init() {
    await super.init();
    this.webdaApplication = (<WebdaConfiguration>(
      this._webda
    )).getWebdaApplication();
  }

  async crudConfiguration(ctx: Context) {
    if (ctx.getHttpContext().getMethod() === "GET") {
      ctx.write(this.webdaApplication.getConfiguration());
    } else if (ctx.getHttpContext().getMethod() === "PUT") {
      ctx.write("Will write webda.config.json");
    }
  }

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

  getService(name: string): ServiceConstructor<Service> {
    if (name.toLowerCase() === "webdaconfiguration/api") {
      return ConfigurationService;
    }
    return super.getService(name);
  }

  getConfiguration(deploymentName: string = undefined): Configuration {
    return {
      version: 2,
      parameters: {
        sessionSecret:
          "qwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqazqwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqazqwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqazqwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqazqwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqazqwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqazqwertyuioplkjhgfdsazxcvbnm,klkjhgfdsaqwertyuioplkjhgfdsazxcvbnmnbvcxzasdfghjklpoiuytrewqaz"
      },
      module: {
        services: {},
        models: {}
      },
      services: {
        api: {
          type: "WebdaConfiguration/API"
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
    super(new ConfigApplication(application.getAppPath()));
    this.webdaApplication = application;
  }

  getWebdaApplication(): Application {
    return this.webdaApplication;
  }

  async serve(): Promise<Object> {
    return super.serve(18181, true);
  }
}
