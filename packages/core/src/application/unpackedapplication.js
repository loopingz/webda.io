var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { deepmerge } from "deepmerge-ts";
import * as fs from "fs";
import { Application } from "./application.js";
import { SectionEnum } from "./iconfiguration.js";
import { FileUtils } from "@webda/utils";
import { getMachineId } from "../core/hooks.js";
import { join, resolve, relative, dirname } from "path";
import { ProcessCache } from "../cache/cache.js";
/**
 * Empty git information
 */
export const EmptyGitInformation = {
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
let UnpackedApplication = (() => {
    var _a;
    let _classSuper = Application;
    let _staticExtraInitializers = [];
    let _static_findModulesFiles_decorators;
    return _a = class UnpackedApplication extends _classSuper {
            constructor(file, logger) {
                super(typeof file === "string"
                    ? file
                    : {
                        version: 4,
                        application: {},
                        services: {},
                        parameters: {},
                        ...file
                    }, logger);
                if (typeof file !== "string") {
                    this.baseConfiguration = this.completeConfiguration(this.baseConfiguration);
                }
            }
            /**
             * Ensure default configuration after load
             * @returns
             */
            async load() {
                await super.load();
                // Ensuring default configuration after loadModule as we do auto-type guess and needs the Modda
                // We only do it in UnpackedApplication as Application should be optimized for startup
                // Application should have a webda.config.json optimized by the builder
                // webda config > webda.config.json
                this.ensureDefaultConfiguration(this.baseConfiguration);
                return this;
            }
            /**
             * Ensure default parameters are set on our application
             * Creating the default services if they do not exist
             *
             * Might want to have only this in unpackaged application as Application should
             * have a perfectly valid configuration
             * @param configuration
             */
            ensureDefaultConfiguration(configuration) {
                var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
                configuration.services ?? (configuration.services = {});
                configuration.parameters ?? (configuration.parameters = {});
                (_b = configuration.parameters).apiUrl ?? (_b.apiUrl = "http://localhost:18080");
                (_c = configuration.parameters).metrics ?? (_c.metrics = {});
                if (configuration.parameters.metrics) {
                    (_d = configuration.parameters.metrics).labels ?? (_d.labels = {});
                    (_e = configuration.parameters.metrics).config ?? (_e.config = {});
                    (_f = configuration.parameters.metrics).prefix ?? (_f.prefix = "");
                }
                (_g = configuration.parameters).configurationService ?? (_g.configurationService = "Configuration");
                (_h = configuration.parameters).defaultStore ?? (_h.defaultStore = "Registry");
                const autoRegistry = configuration.services["Registry"] === undefined;
                (_j = configuration.services)["Router"] ?? (_j["Router"] = {
                    type: "Webda/Router"
                });
                // Registry by default
                (_k = configuration.services)["Registry"] ?? (_k["Registry"] = {
                    type: "Webda/MemoryStore",
                    persistence: {
                        path: ".registry",
                        key: getMachineId()
                    }
                });
                // CryptoService by default
                (_l = configuration.services)["CryptoService"] ?? (_l["CryptoService"] = {
                    type: "Webda/CryptoService",
                    autoRotate: autoRegistry ? 30 : undefined,
                    autoCreate: true
                });
                // By default use CookieSessionManager
                // TODO Should not be added here as it is only for HTTP
                (_m = configuration.services)["SessionManager"] ?? (_m["SessionManager"] = {
                    type: "Webda/CookieSessionManager"
                });
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
             * Load full configuration
             *
             * webda.config.json and complete the cachedModule
             *
             * @param file
             * @returns
             */
            async loadConfiguration(file) {
                if (!file && this.baseConfiguration) {
                    this.baseConfiguration = this.completeConfiguration({ version: 4, ...this.baseConfiguration });
                }
                else if (!fs.existsSync(file)) {
                    this.baseConfiguration = this.completeConfiguration({ version: 4, parameters: {} });
                }
                else {
                    this.baseConfiguration = this.completeConfiguration(FileUtils.load(file));
                }
                // If cachedModules is defined we do not recompute
                if (!this.baseConfiguration.cachedModules) {
                    this.baseConfiguration.cachedModules = {
                        project: this.loadProjectInformation(),
                        beans: {},
                        deployers: {},
                        models: {},
                        schemas: {},
                        moddas: {}
                    };
                    this.log("DEBUG", "Merging modules into configuration");
                    await this.mergeModules(this.baseConfiguration);
                }
            }
            /**
             * Add Moddas, Models and Deployers definitions
             * It also add the project metadata
             *
             * @param configuration
             * @returns
             */
            completeConfiguration(configuration) {
                // Only one level of includes is permitted
                const imports = configuration.$import || [];
                const effectiveImports = [];
                for (const importFile of imports) {
                    if (!fs.existsSync(this.getPath(importFile))) {
                        this.log("WARN", `Cannot import configuration '${importFile}'`);
                        continue;
                    }
                    effectiveImports.push(importFile);
                    const includeConfiguration = FileUtils.load(this.getPath(importFile));
                    if (includeConfiguration.imports?.length) {
                        this.log("WARN", `Imported configuration '${importFile}' has nested imports that will be skipped`);
                    }
                    configuration = deepmerge(includeConfiguration, configuration);
                }
                configuration.$import = effectiveImports;
                // Ensure default values
                return configuration;
            }
            /**
             * @returns empty git information
             */
            getGitInformation(_name, _version) {
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
            loadProjectInformation() {
                const info = {
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
                let packageJson = join(this.applicationPath, "package.json");
                if (fs.existsSync(packageJson)) {
                    info.package = FileUtils.load(packageJson);
                }
                info.git = this.getGitInformation(info.package?.name, info.package?.version);
                info.webda = info.package.webda || {};
                let parent = join(this.applicationPath, "..");
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
            static async findModulesFiles(path) {
                if (!path.endsWith("node_modules") || !fs.existsSync(path)) {
                    return [];
                }
                const files = new Set();
                const checkFolder = async (filepath) => {
                    if (fs.existsSync(join(filepath, "webda.module.json"))) {
                        files.add(join(filepath, "webda.module.json"));
                    }
                    if (fs.existsSync(join(filepath, "node_modules"))) {
                        (await _a.findModulesFiles(join(filepath, "node_modules"))).forEach(f => files.add(f));
                    }
                };
                const recursiveSearch = async (dirpath, depth = 0) => {
                    await Promise.all((await fs.promises.readdir(dirpath, { withFileTypes: true })).map(async (file) => {
                        if (file.name.startsWith(".")) {
                            return;
                        }
                        const filepath = join(dirpath, file.name);
                        if (file.isDirectory() && file.name.startsWith("@") && depth === 0) {
                            // One recursion
                            await recursiveSearch(filepath, depth + 1);
                        }
                        else if (file.isDirectory()) {
                            await checkFolder(filepath);
                        }
                        else if (file.isSymbolicLink()) {
                            // We want to follow symbolic links w/o increasing depth
                            let realPath;
                            try {
                                // realpathSync will throw if the symlink is broken
                                realPath = await fs.promises.realpath(filepath);
                            }
                            catch (err) {
                                return;
                            }
                            await checkFolder(realPath);
                        }
                    }));
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
            async findModules(module) {
                const appPath = this.getPath();
                // Modules should be cached on deploy
                const files = [];
                const currentModule = this.getPath("webda.module.json");
                if (fs.existsSync(currentModule)) {
                    files.push(currentModule);
                }
                this.log("TRACE", "Searching for modules in", this.getPath("node_modules"));
                files.push(...(await _a.findModulesFiles(this.getPath("node_modules"))));
                // Search workspace for webda.module.json
                if (module.project.webda.workspaces && module.project.webda.workspaces.path !== "") {
                    this.log("TRACE", "Searching for modules in", join(module.project.webda.workspaces.path, "node_modules"));
                    files.push(...(await _a.findModulesFiles(join(module.project.webda.workspaces.path, "node_modules"))));
                }
                // Ensure we are not adding many times the same modules
                // App's own module always included, filterModule only applies to dependencies
                const currentModuleReal = fs.existsSync(currentModule) ? fs.realpathSync(currentModule) : undefined;
                const moduleInfo = Array.from(new Set(files.map(n => fs.realpathSync(n)))).filter(f => f === currentModuleReal || this.filterModule(f));
                this.log("TRACE", "Found modules", moduleInfo, "for", appPath);
                return moduleInfo;
            }
            /**
             * Only allow local and core module and sample-app
             */
            filterModule(_filename) {
                return true;
            }
            /**
             * Load a webda.module.json file
             * Resolve the linked file to current application
             *
             * @param moduleFile to load
             * @returns
             */
            loadWebdaModule(moduleFile) {
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
                    if (this.getPath("webda.module.json") !== moduleFile && SectionEnum[p] === "beans") {
                        delete module[SectionEnum[p]];
                        return;
                    }
                    for (const key in module[SectionEnum[p]]) {
                        module[SectionEnum[p]][key].Import = join(relative(this.getPath(), dirname(moduleFile)), module[SectionEnum[p]][key].Import);
                    }
                });
                return module;
            }
            /**
             * Merge all modules into one cached module
             *
             * @param module
             */
            async mergeModules(configuration) {
                const module = configuration.cachedModules;
                const appModule = this.getPath("webda.module.json");
                const files = await this.findModules(module);
                const value = files
                    .map(f => {
                    const currentModule = this.loadWebdaModule(f);
                    // We only take the Beans from current application
                    if (appModule !== f) {
                        this.log("DEBUG", `Load module without beans '${f}'`);
                        delete currentModule.beans;
                    }
                    else {
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
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _static_findModulesFiles_decorators = [ProcessCache()];
            __esDecorate(_a, null, _static_findModulesFiles_decorators, { kind: "method", name: "findModulesFiles", static: true, private: false, access: { has: obj => "findModulesFiles" in obj, get: obj => obj.findModulesFiles }, metadata: _metadata }, null, _staticExtraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_a, _staticExtraInitializers);
        })(),
        _a;
})();
export { UnpackedApplication };
//# sourceMappingURL=unpackedapplication.js.map