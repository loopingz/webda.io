import { WorkerOutput } from "@webda/workout";
import { deepmerge } from "deepmerge-ts";
import * as fs from "fs";
import Finder from "fs-finder";
import * as path from "path";
import {
  Application,
  CachedModule,
  Configuration,
  GitInformation,
  ProjectInformation,
  SectionEnum
} from "./application";
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
    // Only one level of includes is permitted
    let imports = configuration.imports || [];
    let effectiveImports = [];
    for (let importFile of imports) {
      if (!fs.existsSync(this.getAppPath(importFile))) {
        this.log("WARN", `Cannot import configuration '${importFile}'`);
        continue;
      }
      effectiveImports.push(importFile);
      let includeConfiguration = FileUtils.load(this.getAppPath(importFile));
      if (includeConfiguration.imports?.length) {
        this.log("WARN", `Imported configuration '${importFile}' has nested imports that will be skipped`);
      }
      configuration = deepmerge(includeConfiguration, configuration);
    }
    configuration.imports = effectiveImports;
    // If cachedModules is defined we do not recompute
    if (!configuration.cachedModules) {
      configuration.cachedModules = {
        project: this.loadProjectInformation(),
        beans: {},
        deployers: {},
        models: {},
        schemas: {},
        moddas: {}
      };
      this.mergeModules(configuration);
    }
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
      info.package = FileUtils.load(packageJson);
    }
    info.git = this.getGitInformation(info.package?.name, info.package?.version);
    info.webda = info.package.webda || {};
    let parent = path.join(this.appPath, "..");
    do {
      packageJson = path.join(parent, "package.json");
      if (fs.existsSync(packageJson)) {
        let currentInfo = FileUtils.load(packageJson);
        if (currentInfo.workspaces) {
          this.log("DEBUG", "Application is running within a workspace");
          // Replace any relative path by absolute one
          for (let i in currentInfo.webda) {
            if (currentInfo.webda[i].startsWith("./")) {
              currentInfo.webda[i] = path.join(path.resolve(parent), currentInfo.webda[i].substr(2));
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
      parent = path.resolve(path.join(parent, ".."));
    } while (parent !== path.resolve(path.join(parent, "..")));
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
    // Modules should be cached on deploy
    let files = [];
    let currentModule = this.getAppPath("webda.module.json");
    if (fs.existsSync(currentModule)) {
      files.push(currentModule);
    }

    let nodeModules = this.getAppPath("node_modules");
    if (fs.existsSync(nodeModules)) {
      files.push(...Finder.from(nodeModules).findFiles("webda.module.json"));
    }

    // Search workspace for webda.module.json
    if (module.project.webda.workspaces && module.project.webda.workspaces.path !== "") {
      nodeModules = path.join(module.project.webda.workspaces.path, "node_modules");
      if (fs.existsSync(nodeModules)) {
        files.push(...Finder.from(nodeModules).findFiles("webda.module.json"));
      }
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
        if (this.getAppPath("webda.module.json") !== moduleFile && SectionEnum[p] === "beans") {
          delete module[SectionEnum[p]];
          return;
        }
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
    const appModule = this.getAppPath("webda.module.json");
    let files = this.findModules(module);
    let value = files
      .map(f => {
        let currentModule = this.loadWebdaModule(f);
        // We only take the Beans from current application
        if (appModule !== f) {
          this.log("DEBUG", `Load module without beans '${f}'`);
          delete currentModule.beans;
        } else {
          this.log("DEBUG", `Load module with beans '${f}'`);
        }
        return currentModule;
      })
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
