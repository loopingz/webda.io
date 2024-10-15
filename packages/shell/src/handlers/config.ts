import {
  Application,
  Configuration,
  CoreModel,
  RequestFilter,
  SectionEnum,
  Service,
  ServiceConstructor,
  useApplication,
  WebContext
} from "@webda/core";
import * as path from "path";
import { Deployment } from "../models/deployment";
import { WebdaServer } from "./http";

/**
 * @WebdaModda webdashell/configuration
 */
export default class ConfigurationService extends Service implements RequestFilter<WebContext> {
  webdaApplication: Application;

  async checkRequest(context: WebContext): Promise<boolean> {
    if (context.getHttpContext().getHeader("origin") === "localhost:18181") {
      return true;
    }
    return false;
  }

  resolve(): this {
    super.resolve();
    //this._webda.registerCORSFilter(this);
    //this._webda.registerRequestFilter(this);
    this.addRoute("/configuration", ["GET", "PUT"], this.crudConfiguration);
    this.addRoute("/application", ["GET"], this.getApplication);
    this.addRoute("/npm", ["POST"], this.npmSearch);
    this.addRoute("/npm/search", ["POST"], this.npmSearch);
    this.addRoute("/webda", ["GET"], this.getWebdaVersions);
    this.addRoute("/openapi", ["GET"], this.crudConfiguration);
    return this;
  }

  async crudConfiguration(ctx: WebContext) {
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
  async getWebdaVersions(ctx: WebContext) {
    ctx.write({
      Core: useApplication(),
      Shell: this.webdaApplication.getPackageDescription().version
    });
  }

  async npmSearch(ctx: WebContext) {
    ctx.write({});
  }

  async getApplication(ctx: WebContext) {
    ctx.write(this.webdaApplication);
  }
}
export { ConfigurationService };

export class ConfigApplication extends Application {
  getModel(model: string): any {
    if (model.toLowerCase() === "webdaconfiguration/deployment") {
      return Deployment;
    } else if (model.toLowerCase() === "webda/coremodel") {
      return CoreModel;
    }
    return super.getModel(model);
  }

  constructor(application: Application) {
    super(application.getAppPath());
    Object.values(SectionEnum).forEach(section => {
      //this[section] = application[section];
    });
  }

  getConfiguration(_deploymentName: string = undefined): Configuration {
    return {
      version: 4,
      parameters: {},
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
    return super.serve(18181);
  }
}
