import { WorkerOutput } from "@webda/workout";
import { deepmerge } from "deepmerge-ts";
import * as fs from "fs";
import { Application } from "./application";
import {
  type CachedModule,
  type Configuration,
  type GitInformation,
  type ProjectInformation,
  SectionEnum,
  type UnpackedConfiguration
} from "../internal/iapplication";
import { FileUtils } from "@webda/utils";
import { getMachineId } from "../core/hooks";
import { join, resolve, relative, dirname } from "path";
import { ProcessCache } from "../cache/cache";

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
  constructor(file: string | Partial<UnpackedConfiguration>, logger?: WorkerOutput) {
    super(
      typeof file === "string"
        ? file
        : {
            version: 4,
            application: {},
            services: {},
            parameters: {},
            ...file
          },
      logger
    );
    if (typeof file !== "string") {
      this.baseConfiguration = this.completeConfiguration(this.baseConfiguration);
    }
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
    if (!file && this.baseConfiguration) {
      this.baseConfiguration = this.completeConfiguration({ version: 4, ...this.baseConfiguration });
    } else if (!fs.existsSync(file)) {
      this.baseConfiguration = this.completeConfiguration({ version: 4, parameters: {} });
    } else {
      this.baseConfiguration = this.completeConfiguration(FileUtils.load(file));
    }
  }

  /**
   * Find modules on load
   * @returns
   */
  async load() {
    await super.load();
    const configuration = this.getConfiguration();
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
      this.log("DEBUG", "Merging modules into configuration");
      await this.mergeModules(configuration);
    }
    return this;
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
    const imports = configuration.imports || [];
    const effectiveImports = [];
    for (const importFile of imports) {
      if (!fs.existsSync(this.getAppPath(importFile))) {
        this.log("WARN", `Cannot import configuration '${importFile}'`);
        continue;
      }
      effectiveImports.push(importFile);
      const includeConfiguration = FileUtils.load(this.getAppPath(importFile));
      if (includeConfiguration.imports?.length) {
        this.log("WARN", `Imported configuration '${importFile}' has nested imports that will be skipped`);
      }
      configuration = deepmerge(includeConfiguration, configuration);
    }
    configuration.imports = effectiveImports;
    this.ensureDefaultConfiguration(configuration);
    // Ensure default values
    return configuration;
  }

  /**
   * Ensure default parameters are set on our application
   * Creating the default services if they do not exist
   * @param configuration
   */
  ensureDefaultConfiguration(configuration: Configuration) {
    configuration.services ??= {};
    configuration.parameters ??= {};
    configuration.parameters.metrics ??= {};
    if (configuration.parameters.metrics) {
      configuration.parameters.metrics.labels ??= {};
      configuration.parameters.metrics.config ??= {};
      configuration.parameters.metrics.prefix ??= "";
    }
    configuration.parameters.configurationService ??= "Configuration";
    configuration.parameters.defaultStore ??= "Registry";
    const autoRegistry = configuration.services["Registry"] === undefined;

    configuration.services["Router"] ??= {
      type: "Webda/Router"
    };

    // Registry by default
    configuration.services["Registry"] ??= {
      type: "Webda/MemoryStore",
      persistence: {
        path: ".registry",
        key: getMachineId()
      }
    };

    // CryptoService by default
    configuration.services["CryptoService"] ??= {
      type: "Webda/CryptoService",
      autoRotate: autoRegistry ? 30 : undefined,
      autoCreate: true
    };

    // By default use CookieSessionManager
    configuration.services["SessionManager"] ??= {
      type: "Webda/CookieSessionManager"
    };

    // Ensure type is set to default
    for (const serviceName in configuration.services) {
      if (configuration.services[serviceName].type !== undefined) {
        continue;
      }
      if (this.moddas[this.completeNamespace(serviceName)]) {
        configuration.services[serviceName].type = this.completeNamespace(serviceName);
        continue;
      }
      if (!serviceName.includes("/") && this.moddas[`Webda/${serviceName}`]) {
        configuration.services[serviceName].type = `Webda/${serviceName}`;
      }
    }
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

  upgradeConfigToV4() {
    /*
    // Move to router
  
    trustedProxies
    csrfOrigins
    website
    static
    apiUrl
    requestLimit
    requestTimeout
    defaultHeaders

    // Move to Core
    configurationService
    defaultStore
    ignoreBeans

    // metrics??
    */
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
    let packageJson = join(this.appPath, "package.json");
    if (fs.existsSync(packageJson)) {
      info.package = FileUtils.load(packageJson);
    }
    info.git = this.getGitInformation(info.package?.name, info.package?.version);
    info.webda = info.package.webda || {};
    let parent = join(this.appPath, "..");
    do {
      packageJson = join(parent, "package.json");
      if (fs.existsSync(packageJson)) {
        const currentInfo = FileUtils.load(packageJson);
        if (currentInfo.workspaces) {
          this.log("DEBUG", "Application is running within a workspace");
          // Replace any relative path by absolute one
          for (const i in currentInfo.webda) {
            if (currentInfo.webda[i].startsWith("./")) {
              currentInfo.webda[i] = join(resolve(parent), currentInfo.webda[i].substr(2));
            }
          }
          info.webda = deepmerge(currentInfo.webda || {}, info.webda);
          info.webda.workspaces = {
            packages: currentInfo.workspaces,
            parent: currentInfo,
            path: resolve(parent)
          };
          break;
        }
      }
      parent = resolve(join(parent, ".."));
    } while (parent !== resolve(join(parent, "..")));
    // Check modules

    return info;
  }

  /**
   * Search the node_modules structure for webda.module.json files
   *
   * @param path
   * @returns
   */
  @ProcessCache
  static async findModulesFiles(path: string): Promise<string[]> {
    if (!path.endsWith("node_modules")) {
      return [];
    }
    const files = new Set<string>();
    const checkFolder = async (filepath: string) => {
      if (fs.existsSync(join(filepath, "webda.module.json"))) {
        files.add(join(filepath, "webda.module.json"));
      }
      if (fs.existsSync(join(filepath, "node_modules"))) {
        (await this.findModulesFiles(join(filepath, "node_modules"))).forEach(f => files.add(f));
      }
    };
    const recursiveSearch = async (dirpath: string, depth: number = 0) => {
      await Promise.all(
        (await fs.promises.readdir(dirpath, { withFileTypes: true })).map(async file => {
          if (file.name.startsWith(".")) {
            return;
          }
          const filepath = join(dirpath, file.name);
          if (file.isDirectory() && file.name.startsWith("@") && depth === 0) {
            // One recursion
            await recursiveSearch(filepath, depth + 1);
          } else if (file.isDirectory()) {
            await checkFolder(filepath);
          } else if (file.isSymbolicLink()) {
            // We want to follow symbolic links w/o increasing depth
            let realPath;
            try {
              // realpathSync will throw if the symlink is broken
              realPath = await fs.promises.realpath(filepath);
            } catch (err) {
              return;
            }
            await checkFolder(realPath);
          }
        })
      );
    };
    await recursiveSearch(path, 0);
    return [...files];
  }

  /**
   * Load all imported modules and current module
   * It will compile module
   * Generate the current module file
   * Load any imported webda.module.json
   */
  async findModules(module: CachedModule): Promise<string[]> {
    const appPath = this.getAppPath();

    // Modules should be cached on deploy
    const files = [];
    const currentModule = this.getAppPath("webda.module.json");
    if (fs.existsSync(currentModule)) {
      files.push(currentModule);
    }

    this.log("TRACE", "Searching for modules in", this.getAppPath("node_modules"));
    files.push(...(await UnpackedApplication.findModulesFiles(this.getAppPath("node_modules"))));
    // Search workspace for webda.module.json
    if (module.project.webda.workspaces && module.project.webda.workspaces.path !== "") {
      this.log("TRACE", "Searching for modules in", join(module.project.webda.workspaces.path, "node_modules"));
      files.push(
        ...(await UnpackedApplication.findModulesFiles(join(module.project.webda.workspaces.path, "node_modules")))
      );
    }

    // Ensure we are not adding many times the same modules
    const moduleInfo = Array.from(new Set(files.map(n => fs.realpathSync(n)))).filter(f => this.filterModule(f));
    this.log("TRACE", "Found modules", moduleInfo, "for", appPath);
    return moduleInfo;
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
    const module = FileUtils.load(moduleFile);
    if (!module.$schema?.endsWith("/webda.module.v4.json")) {
      this.log("WARN", `Module '${moduleFile}' is not a v4 format, skipping module`);
      return {
        models: {},
        schemas: {},
        beans: {},
        deployers: {},
        moddas: {},
        project: undefined
      };
    }
    Object.keys(SectionEnum)
      .filter(k => Number.isNaN(+k))
      .forEach(p => {
        // Do not keep Beans from other modules
        if (this.getAppPath("webda.module.json") !== moduleFile && SectionEnum[p] === "beans") {
          delete module[SectionEnum[p]];
          return;
        }
        for (const key in module[SectionEnum[p]]) {
          module[SectionEnum[p]][key].Import = join(
            relative(this.getAppPath(), dirname(moduleFile)),
            module[SectionEnum[p]][key].Import
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
  async mergeModules(configuration: Configuration) {
    const module: CachedModule = configuration.cachedModules;
    const appModule = this.getAppPath("webda.module.json");
    const files = await this.findModules(module);
    const value = files
      .map(f => {
        const currentModule = this.loadWebdaModule(f);
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
    // Copying schemas
    module.schemas = value.schemas;
    this.log("DEBUG", "Merged modules", module);
    await this.loadModule(module);
    return module;
  }
}
