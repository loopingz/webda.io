import { Query } from "@webda/ql";
import { OwnerModel } from "../models/ownermodel";
import { Store, StoreFindResult, StoreParameters } from "../stores/store";
import { Service } from "../services/service";
import { Ident as WebdaIdent } from "../models/ident";
import { UnpackedApplication } from "../application/unpackedapplication";
import { CachedModule, SectionEnum, UnpackedConfiguration } from "../internal/iapplication";
import { WorkerOutput } from "@webda/workout";
import { execSync } from "node:child_process";
import path from "node:path";
import { FileUtils } from "@webda/utils";
import { ModelEvents, ModelActions, WEBDA_ACTIONS, ActionsEnum } from "@webda/models";
import { ServiceParameters } from "../interfaces";
import { IOperationContext } from "../contexts/icontext";

export type TaskEvents<T> = ModelEvents<T> & {
  Done: { task: T };
  Started: { task: T };
  Errored: { task: T };
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
  [WEBDA_ACTIONS]: ModelActions<"create" | "get" | "update" | "delete"> & {
    actionable: {
      rest: {
        methods: ["GET"];
      };
    };
    impossible: {};
  };

  actionable() {}

  impossible() {}

  async canAct(context: IOperationContext, action: ActionsEnum<Task> | string): Promise<boolean | string> {
    if ("actionable" === action) {
      return true;
    }
    if ("impossible" === action) {
      return "Action impossible is not allowed";
    }
    return super.canAct(context, action as any);
  }

  async _onSave() {
    this._autoListener = 1;
  }

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
  find(_query: Query): Promise<StoreFindResult<any>> {
    throw new Error("Method not implemented.");
  }
  _exists(_uid: string): Promise<boolean> {
    throw new Error("Method not implemented.");
  }
  getAll(_list?: string[]): Promise<any[]> {
    throw new Error("Method not implemented.");
  }
  static createConfiguration(params: any): any {
    return new StoreParameters().load(params).default();
  }
  protected _patch(
    _object: any,
    _uid: string,
    _itemWriteCondition?: any,
    _itemWriteConditionField?: string
  ): Promise<any> {
    throw new Error("Method not implemented.");
  }
  protected _removeAttribute(
    _uuid: string,
    _attribute: string,
    _itemWriteCondition?: any,
    _itemWriteConditionField?: string
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  protected _incrementAttributes(
    _uid: string,
    _params: { property: string; value: number }[],
    _updateDate: Date
  ): Promise<any> {
    throw new Error("Method not implemented.");
  }
  protected _upsertItemToCollection(
    _uid: string,
    _prop: string,
    _item: any,
    _index: number,
    _itemWriteCondition: any,
    _itemWriteConditionField: string,
    _updateDate: Date
  ): Promise<any> {
    throw new Error("Method not implemented.");
  }
  protected _deleteItemFromCollection(
    _uid: string,
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

  initRoutes() {
    if (this.parameters.brokenInit) throw Error();
    this.addRoute("/broken/{type}", ["GET"], this._brokenRoute);
    this.addRoute("/", ["GET", "POST"], this._default);
    this.addRoute("/urltemplate/{+id}", ["GET"], this._template);
    this.addRoute("/urltemplate/callback{?code}", ["GET"], this._query);
  }

  loadParameters(params) {
    return new StoreParameters().load(params);
  }

  _template() {}

  _default(_ctx) {}

  _query(_ctx) {}

  _brokenRoute(ctx) {
    if (ctx.getParameters().type === "401") {
      throw 401;
    } else if (ctx.getParameters().type === "Error") {
      throw new Error();
    }
  }

  exists(_uid) {
    return Promise.resolve(true);
  }

  _find(_request, _offset, _limit) {
    return Promise.resolve([]);
  }

  async _create(_uid: string, object: any) {
    return object;
  }

  _delete(_uid) {
    return Promise.resolve();
  }

  _update(_uid, object) {
    return Promise.resolve(object);
  }

  async _get(_uid) {
    return {};
  }
}

/**
 * FakeService is a service that does not implement any method
 * @WebdaIgnore
 */
export class FakeService extends Service {
  static createConfiguration(params: any): any {
    return new ServiceParameters().load(params).default();
  }
}

/**
 * @class
 * @WebdaIgnore
 */
export class TestIdent extends WebdaIdent {
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

  yop() {
    return "youpi";
  }

  async canAct(action) {
    return true;
  }

  static index(ctx) {
    ctx.write("indexer");
  }

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
      execSync(`tsc -p ${this.appPath}`);
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
              path.relative(this.getAppPath(), path.dirname(moduleFile)),
              module[SectionEnum[p]][key].Import.replace(/^lib\//, "src/").replace(":", ".ts:")
            );
          }
        });
      return module;
    }
    return super.loadWebdaModule(moduleFile);
  }
}
