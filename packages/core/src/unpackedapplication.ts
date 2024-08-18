import { WorkerOutput } from "@webda/workout";
import { deepmerge } from "deepmerge-ts";
import * as fs from "fs";
import * as path from "path";
import {
  Application,
  CachedModule,
  Configuration,
  GitInformation,
  ProjectInformation,
  SectionEnum,
  UnpackedConfiguration
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
  constructor(file: string | Partial<UnpackedConfiguration>, logger?: WorkerOutput) {
    super(
      typeof file === "string"
        ? file
        : {
            version: 3,
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
      this.baseConfiguration = this.completeConfiguration({ version: 3, ...this.baseConfiguration });
    } else if (!fs.existsSync(file)) {
      this.baseConfiguration = this.completeConfiguration({ version: 3 });
    } else {
      this.baseConfiguration = this.completeConfiguration(FileUtils.load(file));
    }
  }

  /**
   * Compute short ids
   * @returns
   */
  async load(): Promise<this> {
    await super.load();
    const keys = Object.keys(this.getModels());
    const namespace = this.getNamespace() + "/";
    // All models from current namespace should have a short id
    keys
      .filter(key => key.startsWith(namespace))
      .forEach(key => {
        this.baseConfiguration.cachedModules.models.shortIds[key.substring(namespace.length)] = key;
        this.baseConfiguration.cachedModules.models.shortIds[key] = key.substring(namespace.length);
      });
    // If models from other namespaces have no local ones then they have short id too
    keys
      .filter(key => !key.startsWith(namespace))
      .forEach(key => {
        const shortId = key.split("/")[1];
        if (!this.baseConfiguration.cachedModules.models.shortIds[shortId]) {
          this.baseConfiguration.cachedModules.models.shortIds[shortId] = key;
          this.baseConfiguration.cachedModules.models.shortIds[key] = shortId;
        }
      });
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
        models: {
          list: {},
          graph: {},
          tree: {},
          plurals: {},
          shortIds: {},
          reflections: {}
        },
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
   * Store the current module
   * @returns
   */
  getModulesCache() {
    // @ts-ignore
    const cacheModules = process.webdaModules || {};
    // @ts-ignore
    process.webdaModules ??= cacheModules;
    return cacheModules;
  }

  /**
   * Load all imported modules and current module
   * It will compile module
   * Generate the current module file
   * Load any imported webda.module.json
   */
  findModules(module: CachedModule): string[] {
    const appPath = this.getAppPath();

    const cacheModules = this.getModulesCache();
    // Cache modules to speed up tests
    if (cacheModules[appPath]) {
      return cacheModules[appPath];
    }
    // Modules should be cached on deploy
    let files = [];
    let currentModule = this.getAppPath("webda.module.json");
    if (fs.existsSync(currentModule)) {
      files.push(currentModule);
    }

    const findModuleFiles = (nodeModules: string): void => {
      if (!fs.existsSync(nodeModules)) {
        return;
      }
      FileUtils.walkSync(
        nodeModules,
        filepath => {
          // We filter out the cache of nx
          // If it is inside a node_modules/. we consider it should not be checked
          if (filepath.endsWith("webda.module.json") && !filepath.includes("node_modules/.")) {
            files.push(filepath);
          }
        },
        { followSymlinks: true }
      );
    };

    findModuleFiles(this.getAppPath("node_modules"));
    // Search workspace for webda.module.json
    if (module.project.webda.workspaces && module.project.webda.workspaces.path !== "") {
      findModuleFiles(path.join(module.project.webda.workspaces.path, "node_modules"));
    }

    // Ensure we are not adding many times the same modules
    cacheModules[appPath] = Array.from(new Set(files.map(n => fs.realpathSync(n)))).filter(f => this.filterModule(f));
    return cacheModules[appPath];
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
        // Do not keep Beans from other modules
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

    for (let key in module.models.list) {
      module.models.list[key] = path.join(
        path.relative(this.getAppPath(), path.dirname(moduleFile)),
        module.models.list[key]
      );
    }
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
    // Copying models
    module.models.list = value.models.list;
    module.models.graph = value.models.graph;
    module.models.tree = value.models.tree;
    module.models.plurals = value.models.plurals;
    // Copying schemas
    module.schemas = value.schemas;
  }
}
