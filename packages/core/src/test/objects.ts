import { Query } from "@webda/ql";
import { OwnerModel } from "../models/ownermodel.js";
import { Store, StoreFindResult, StoreParameters } from "../stores/store.js";
import { Service } from "../services/service.js";
import { Ident as WebdaIdent } from "../models/ident.js";
import { UnpackedApplication } from "../application/unpackedapplication.js";
import { CachedModule, SectionEnum, UnpackedConfiguration } from "../application/iconfiguration.js";
import { WorkerOutput } from "@webda/workout";
import { execSync } from "node:child_process";
import path from "node:path";
import { FileUtils } from "@webda/utils";
import {
  ModelEvents,
  PrimaryKey,
  ModelClass,
  Repository,
  MemoryRepository
} from "@webda/models";
import { ServiceParameters } from "../services/serviceparameters.js";
import { IOperationContext } from "../contexts/icontext.js";

export type TaskEvents<T> = ModelEvents<T> & {
  Done: { task: T };
  Started: { task: T };
  Errored: { task: T };
};

type RESTConfiguration<Methods extends "PUT" | "GET" | "POST" | "DELETE", Route extends string> = {
  rest: {
    methods: Methods[];
    path: Route;
  };
};

type GraphQLConfiguration<Name extends string = any> = {
  graphql: {
    operations: {
      [key in Name]: {
        query: string;
        variables: Record<string, any>;
      };
    };
  };
};

/**
 * An additional test model
 * @class
 * @WebdaIgnore
 */
export class Task extends OwnerModel {
  declare Events: TaskEvents<this>;

  _autoListener: number;

  side: string;

  _gotContext: boolean;

  /** Test action that is always allowed */
  actionable() {}

  /** Test action that is never allowed */
  impossible() {}

  /** Check permissions based on action name for testing */
  async canAct(context: IOperationContext, actionArg: string): Promise<boolean | string> {
    const action: string = actionArg;
    if (action === "actionable") {
      return true;
    }
    if ("impossible" === action) {
      return "Action impossible is not allowed";
    }
    return super.canAct(context, actionArg);
  }

  /** Test hook: set listener flag on save */
  async _onSave() {
    this._autoListener = 1;
  }

  /** Test hook: set listener flag after save */
  async _onSaved() {
    this._autoListener = 2;
  }
}

/**
 * VoidStore is a store that does not implement any method
 *
 * It does add some route to simulates errors
 * @WebdaIgnore
 */
export class VoidStore extends Store<StoreParameters & { brokenConstructor?: boolean; brokenInit?: boolean }> {
  /** Not implemented */
  find(_query: Query): Promise<StoreFindResult<any>> {
    throw new Error("Method not implemented.");
  }
  /** Not implemented */
  _exists(_uid: PrimaryKey<any>): Promise<boolean> {
    throw new Error("Method not implemented.");
  }
  /** Not implemented */
  getAll(_list?: PrimaryKey<any>[]): Promise<any[]> {
    throw new Error("Method not implemented.");
  }
  /** Create default store configuration */
  static createConfiguration(params: any): any {
    return new StoreParameters().load(params);
  }
  /** Return parameters unchanged */
  static filterParameters(params: any): any {
    return params;
  }
  /** Not implemented */
  protected _patch(
    _object: any,
    _uid: string,
    _itemWriteCondition?: any,
    _itemWriteConditionField?: string
  ): Promise<any> {
    throw new Error("Method not implemented.");
  }
  /** Not implemented */
  protected _removeAttribute(
    _uuid: PrimaryKey<any>,
    _attribute: string,
    _itemWriteCondition?: any,
    _itemWriteConditionField?: string
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  /** Not implemented */
  protected _incrementAttributes(
    _uid: PrimaryKey<any>,
    _params: { property: string; value: number }[],
    _updateDate: Date
  ): Promise<any> {
    throw new Error("Method not implemented.");
  }
  /** Not implemented */
  protected _upsertItemToCollection(
    _uid: PrimaryKey<any>,
    _prop: string,
    _item: any,
    _index: number,
    _itemWriteCondition: any,
    _itemWriteConditionField: string,
    _updateDate: Date
  ): Promise<any> {
    throw new Error("Method not implemented.");
  }
  /** Not implemented */
  protected _deleteItemFromCollection(
    _uid: PrimaryKey<any>,
    _prop: string,
    _index: number,
    _itemWriteCondition: any,
    _itemWriteConditionField: string,
    _updateDate: Date
  ): Promise<any> {
    throw new Error("Method not implemented.");
  }
  constructor(name, params) {
    super(name, params);
    if (this.parameters.brokenConstructor) throw Error();
  }

  /** Register test routes for simulating errors and templates */
  initRoutes() {
    if (this.parameters.brokenInit) throw Error();
    this.addRoute("/broken/{type}", ["GET"], this._brokenRoute);
    this.addRoute("/", ["GET", "POST"], this._default);
    this.addRoute("/urltemplate/{+id}", ["GET"], this._template);
    this.addRoute("/urltemplate/callback{?code}", ["GET"], this._query);
  }

  /** Load store parameters */
  loadParameters(params) {
    return new StoreParameters().load(params);
  }

  /** No-op template route handler */
  _template() {}

  /** No-op default route handler */
  _default(_ctx) {}

  /** No-op query route handler */
  _query(_ctx) {}

  /** Route handler that throws errors based on the type parameter */
  _brokenRoute(ctx) {
    if (ctx.getParameters().type === "401") {
      throw 401;
    } else if (ctx.getParameters().type === "Error") {
      throw new Error();
    }
  }

  /** Always returns true */
  exists(_uid) {
    return Promise.resolve(true);
  }

  /** Always returns empty results */
  _find(_request, _offset, _limit) {
    return Promise.resolve([]);
  }

  /** Return the object as-is without persisting */
  async _create(_uid: PrimaryKey<any>, object: any) {
    return object;
  }

  /** No-op delete */
  _delete(_uid) {
    return Promise.resolve();
  }

  /** Return the object as-is without persisting */
  _update(_uid, object) {
    return Promise.resolve(object);
  }

  /** Return an empty object */
  async _get(_uid) {
    return {};
  }

  /** Get an in-memory repository for the model */
  getRepository<T extends ModelClass>(model: T): Repository<T> {
    return new MemoryRepository(model, ["id"]);
  }
}

/**
 * FakeService is a service that does not implement any method
 * @WebdaIgnore
 */
export class FakeService extends Service {
  /** Create the default configuration */
  static createConfiguration(params: any): any {
    return new ServiceParameters().load(params);
  }
  /** Return parameters unchanged */
  static filterParameters(params: any): any {
    return params;
  }
}

/**
 * @class
 * @WebdaIgnore
 */
export class TestIdent extends WebdaIdent {
  /** Define test actions for this ident model */
  static getActions() {
    return <any>{
      plop: {},
      index: {
        global: true,
        methods: ["GET"]
      },
      yop: {
        methods: ["GET", "POST"]
      }
    };
  }

  /** Test action returning a string */
  yop() {
    return "youpi";
  }

  /** Always allow actions */
  async canAct(action) {
    return true;
  }

  /** Global index action */
  static index(ctx) {
    ctx.write("indexer");
  }

  /** Test action writing to context */
  plop(ctx) {
    ctx.write({ _plop: true });
    return Promise.resolve();
  }
}

/**
 * TestApplication ensure we load the typescript sources instead of compiled version
 *
 * Test use ts-node so to share same prototypes we need to load from the sources
 */
export class TestApplication extends UnpackedApplication {
  constructor(file?: string | Partial<UnpackedConfiguration>, logger?: WorkerOutput) {
    super(file || "./", logger);
  }
  /**
   * Force the namespace to WebdaDemo
   * @returns
   */
  getNamespace() {
    return "WebdaDemo";
  }
  /**
   * Set the status of the compilation
   *
   * @param compile true will avoid trigger new compilation
   */
  preventCompilation(compile: boolean) {
    this.compiled = compile;
  }
  /**
   * Flag if application has been compiled already
   */
  protected compiled: boolean = false;
  /**
   * Compile the application
   */
  compile() {
    if (this.compiled) {
      return;
    }
    // exec typescript
    this.log("DEBUG", "Compiling application");
    try {
      execSync(`tsc -p ${this.applicationPath}`);
    } catch (err) {
      (err.stdout.toString() + err.stderr.toString())
        .split("\n")
        .filter(l => l !== "")
        .forEach(l => {
          this.log("ERROR", "tsc:", l);
        });
    }
    this.compiled = true;
  }

  /**
   * Only allow local module and packages/ modules, not sample-apps
   */
  filterModule(filename: string): boolean {
    return !filename.includes("/sample-app") && !filename.includes("/sample-apps/");
  }

  /**
   * Load a webda.module.json file
   * Resolve the linked file to current application
   *
   * @param moduleFile to load
   * @returns
   */
  loadWebdaModule(moduleFile: string): CachedModule {
    // Test are using ts-node so local source should be loaded from .ts with ts-node aswell
    if (process.cwd() === path.dirname(moduleFile) + "/") {
      const module = FileUtils.load(moduleFile);
      Object.keys(SectionEnum)
        .filter(k => Number.isNaN(+k))
        .forEach(p => {
          for (const key in module[SectionEnum[p]]) {
            module[SectionEnum[p]][key].Import = path.join(
              path.relative(this.getPath(), path.dirname(moduleFile)),
              module[SectionEnum[p]][key].Import.replace(/^lib\//, "src/").replace(":", ".ts:")
            );
            if (module[SectionEnum[p]][key].Configuration) {
              module[SectionEnum[p]][key].Configuration = path.join(
                path.relative(this.getPath(), path.dirname(moduleFile)),
                module[SectionEnum[p]][key].Configuration.replace(/^lib\//, "src/").replace(":", ".ts:")
              );
            }
          }
        });
      return module;
    }
    return super.loadWebdaModule(moduleFile);
  }
}
