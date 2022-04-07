import { WorkerOutput } from "@webda/workout";
import {
  Application,
  CachedModule,
  Configuration,
  GitInformation,
  ProjectInformation,
  SectionEnum
} from "./application";
import * as deepmerge from "deepmerge";
import * as fs from "fs";
import * as path from "path";
import { FileUtils } from "./utils/serializers";

/**
 * Empty git information
 */
export const EmptyGitInformation: GitInformation = {
  branch: "",
  commit: "",
  short: "",
  tag: "",
  tags: [],
  version: ""
};

/**
 * An unpacked application load dynamically all webda.module.json
 * And load also all the package description
 *
 * The normal Application is designed to load all this information from
 * the cachedModule to avoid any unecessary action within a production environment
 */
export class UnpackedApplication extends Application {
  constructor(file: string, logger?: WorkerOutput) {
    super(file, logger);
  }

  /**
   * Load full configuration
   *
   * webda.config.json and complete the cachedModule
   *
   * @param file
   * @returns
   */
  loadConfiguration(file: string): void {
    if (!fs.existsSync(file)) {
      this.baseConfiguration = this.completeConfiguration({ version: 3 });
    } else {
      this.baseConfiguration = this.completeConfiguration(FileUtils.load(file));
    }
  }

  /**
   * Add Moddas, Models and Deployers definitions
   * It also add the project metadata
   *
   * @param configuration
   * @returns
   */
  completeConfiguration(configuration: Configuration): Configuration {
    configuration.cachedModules = {
      project: this.loadProjectInformation(),
      beans: {},
      deployers: {},
      models: {},
      schemas: {},
      moddas: {}
    };
    this.mergeModules(configuration);
    return configuration;
  }

  /**
   * @returns empty git information
   */
  getGitInformation(_name?: string, _version?: string): GitInformation {
    return {
      branch: "",
      commit: "",
      short: "",
      tag: "",
      tags: [],
      version: ""
    };
  }

  /**
   * Check package.json
   */
  loadProjectInformation(): ProjectInformation {
    const info: ProjectInformation = {
      deployment: {
        name: ""
      },
      package: {
        name: "",
        version: ""
      },
      git: EmptyGitInformation,
      webda: {}
    };
    let packageJson = path.join(this.appPath, "package.json");
    if (fs.existsSync(packageJson)) {
      info.package = JSON.parse(fs.readFileSync(packageJson).toString());
    }
    info.git = this.getGitInformation(info.package?.name, info.package?.version);
    info.webda = info.package.webda || {};
    let parent = path.join(this.appPath, "..");
    do {
      packageJson = path.join(parent, "package.json");
      if (fs.existsSync(packageJson)) {
        let currentInfo = JSON.parse(fs.readFileSync(packageJson).toString());
        if (currentInfo.workspaces) {
          this.log("DEBUG", "Application is running within a workspace");
          // Replace any relative path by absolute one
          for (let i in currentInfo.webda) {
            if (currentInfo.webda[i].startsWith("./")) {
              currentInfo.webda[i] = path.resolve(parent) + "/" + currentInfo.webda[i].substr(2);
            }
          }
          info.webda = deepmerge(currentInfo.webda || {}, info.webda);
          info.webda.workspaces = {
            packages: currentInfo.workspaces,
            parent: currentInfo,
            path: path.resolve(parent)
          };
          break;
        }
      }
      parent = path.join(parent, "..");
    } while (path.resolve(parent) !== "/");
    // Check modules

    return info;
  }

  /**
   * Load all imported modules and current module
   * It will compile module
   * Generate the current module file
   * Load any imported webda.module.json
   */
  findModules(module: CachedModule): string[] {
    const Finder = require("fs-finder");
    // Modules should be cached on deploy
    var files = [];
    let nodeModules = this.getAppPath("node_modules");
    if (fs.existsSync(nodeModules)) {
      files = Finder.from(nodeModules).findFiles("webda.module.json");
    }

    // Search workspace for webda.module.json
    if (module.project.webda.workspaces && module.project.webda.workspaces.path !== "") {
      nodeModules = path.join(module.project.webda.workspaces.path, "node_modules");
      if (fs.existsSync(nodeModules)) {
        files.push(...Finder.from(nodeModules).findFiles("webda.module.json"));
      }
    }
    let currentModule = this.getAppPath("webda.module.json");
    if (fs.existsSync(currentModule)) {
      files.push(currentModule);
    }
    // Ensure we are not adding many times the same modules
    return Array.from(new Set(files.map(n => fs.realpathSync(n)))).filter(f => this.filterModule(f));
  }

  /**
   * Only allow local and core module and sample-app
   */
  filterModule(_filename: string): boolean {
    return true;
  }

  /**
   * Load a webda.module.json file
   * Resolve the linked file to current application
   *
   * @param moduleFile to load
   * @returns
   */
  loadWebdaModule(moduleFile: string): CachedModule {
    let module = FileUtils.load(moduleFile);
    Object.keys(SectionEnum)
      .filter(k => Number.isNaN(+k))
      .forEach(p => {
        for (let key in module[SectionEnum[p]]) {
          module[SectionEnum[p]][key] = path.join(
            path.relative(this.getAppPath(), path.dirname(moduleFile)),
            module[SectionEnum[p]][key]
          );
        }
      });
    return module;
  }

  /**
   * Merge all modules into one cached module
   *
   * @param module
   */
  mergeModules(configuration: Configuration) {
    const module: CachedModule = configuration.cachedModules;
    let files = new Set<string>(this.findModules(module).map(f => fs.realpathSync(f)));
    let value = Array.from(files)
      .map(f => this.loadWebdaModule(f))
      .reduce((prev, val) => {
        return deepmerge(prev, val);
      }, module);
    Object.keys(SectionEnum)
      .filter(k => Number.isNaN(+k))
      .forEach(p => {
        module[SectionEnum[p]] = value[SectionEnum[p]];
      });
    module.schemas = value.schemas;
  }
}
