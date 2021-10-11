import { CoreModel } from "../models/coremodel";
import { Inject, Service, ServiceParameters } from "../services/service";
import { EventStoreDeleted, EventStorePartialUpdated, EventStoreSaved, EventStoreUpdate, Store } from "./store";

export type MapUpdates = "created" | "deleted" | { [key: string]: any };

export interface Mapper {
  uuid: string;
  [key: string]: any;
}

/**
 * Mapper configuration
 */
class MapperParameters extends ServiceParameters {
  /**
   * Field to duplicate
   */
  fields: string[];
  /**
   * Source service
   */
  source: string;
  /**
   * Target store
   */
  target: string;
  /**
   * Attribute to use for link
   *
   * Depending on the type
   *  - string[]: will consider each string as id
   *  - string: will be consider as id
   *  - Object: each keys will be consider as id
   */
  attribute: string;
  /**
   * The object will contain a Mapper
   */
  targetAttribute: string;
  cascade: boolean;

  constructor(params: any) {
    super(params);
    if (typeof params.fields === "string") {
      this.fields = params.fields.split(",");
    }
    this.cascade ??= false;
    this.fields ??= [];
  }
}

/**
 * Map object to another object
 */
export default class MapperService<T extends MapperParameters = MapperParameters> extends Service<T> {
  @Inject("params:target")
  targetStore: Store;

  @Inject("params:source")
  sourceService: Store;

  loadParameters(params: any) {
    return new MapperParameters(params);
  }

  resolve() {
    super.resolve();
    this.targetStore.addReverseMap(this.parameters.targetAttribute, this.sourceService);
    this.sourceService.on("Store.PartialUpdated", async (evt: EventStorePartialUpdated) => {
      let prop;
      if (evt.partial_update.increment) {
        prop = evt.partial_update.increment.property;
      } else if (evt.partial_update.addItem) {
        prop = evt.partial_update.addItem.property;
      } else if (evt.partial_update.deleteItem) {
        prop = evt.partial_update.deleteItem.property;
      }
      await this._handleMapFromPartial(evt.object_id, evt.updateDate, prop);
    });
    this.sourceService.on("Store.Saved", async (evt: EventStoreSaved) => {
      await this.handleMap(evt.object, "created");
    });
    this.sourceService.on("Store.Update", async (evt: EventStoreUpdate) => {
      await this.handleMap(evt.object, evt.update);
    });
    this.sourceService.on("Store.PatchUpdate", async (evt: EventStoreUpdate) => {
      await this.handleMap(evt.object, evt.update);
    });
    this.sourceService.on("Store.Delete", async (evt: EventStoreDeleted) => {
      await this.handleMap(evt.object, "deleted");
    });
    // Cascade delete when target is destroyed
    if (this.parameters.cascade) {
      this.targetStore.on("Store.Deleted", async (evt: EventStoreDeleted) => {
        let maps = evt.object[this.parameters.targetAttribute];
        if (!maps) {
          return;
        }
        await Promise.all(maps.map(mapper => this.sourceService.cascadeDelete(mapper, evt.object.getUuid())));
      });
    }
  }

  /**
   * Get index of the mapper for an object
   * @param map
   * @param uuid
   * @returns
   */
  getMapper(map: any[], uuid: string): number {
    for (var i = 0; i < map.length; i++) {
      if (map[i].uuid === uuid) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Create an object mapper
   *
   * @param map map to create mapper for
   * @param object for the mapper to represent
   * @param updates to the object being made
   * @returns mapper object and found = true if updates will impact the mapper
   */
  createMapper(object: CoreModel, updates: any): [mapper: Mapper, found: boolean] {
    var mapper: Mapper = {
      uuid: object.getUuid()
    };
    let found = Object.keys(updates).includes(this.parameters.targetAttribute);
    for (let mapperfield of this.parameters.fields) {
      // Create the mapper object
      if (updates[mapperfield] !== undefined) {
        mapper[mapperfield] = updates[mapperfield];
        found = true;
      } else if (object[mapperfield] !== undefined) {
        mapper[mapperfield] = object[mapperfield];
      }
    }
    return [mapper, found];
  }

  async _handleUpdatedMap(source: CoreModel, target: CoreModel, updates: any) {
    let [mapper, found] = this.createMapper(source, updates);
    if (!found) {
      // None of the mapped keys has been modified -> return
      return;
    }

    // check if reference object has changed
    if (
      updates[this.parameters.attribute] !== undefined &&
      target.getUuid() !== updates[this.targetStore.getUuidField()]
    ) {
      let i = this.getMapper(target[this.parameters.targetAttribute], source.getUuid());
      if (i >= 0) {
        // Remove the data from old object
        await this.targetStore.deleteItemFromCollection(
          target.getUuid(),
          this.parameters.targetAttribute,
          i,
          source.getUuid(),
          "uuid"
        );
      }
      // Add the data to new object
      await this.targetStore.upsertItemToCollection(
        updates[this.parameters.attribute],
        this.parameters.targetAttribute,
        mapper
      );
    } else {
      return this._handleUpdatedMapMapper(source, target, mapper);
    }
  }

  _handleUpdatedMapMapper(source: CoreModel, target: CoreModel, mapper: Mapper) {
    // Remove old reference
    let i = this.getMapper(target[this.parameters.targetAttribute], source.getUuid());
    // If not found just add it to the collection
    if (i < 0) {
      return this.targetStore.upsertItemToCollection(target.getUuid(), this.parameters.targetAttribute, mapper);
    }
    // Else update with a check on the uuid
    return this.targetStore.upsertItemToCollection(
      target.getUuid(),
      this.parameters.targetAttribute,
      mapper,
      i,
      source.getUuid(),
      "uuid"
    );
  }

  async _handleDeletedMap(object: CoreModel, mapped: CoreModel) {
    // Remove from the collection
    if (mapped[this.parameters.targetAttribute] === undefined) {
      return;
    }
    let i = this.getMapper(mapped[this.parameters.targetAttribute], object.getUuid());
    if (i >= 0) {
      return this.targetStore.deleteItemFromCollection(
        mapped.getUuid(),
        this.parameters.targetAttribute,
        i,
        object.getUuid(),
        "uuid"
      );
    }
  }

  async _handleCreatedMap(object: CoreModel, mapped: CoreModel) {
    // Add to the object
    let [mapper] = this.createMapper(object, {});
    return this.targetStore.upsertItemToCollection(mapped.getUuid(), this.parameters.targetAttribute, mapper);
  }

  isMapped(property: string): boolean {
    return this.parameters.fields.includes(property);
  }

  async _handleMapFromPartial(uid: string, updateDate: Date, prop: string = undefined) {
    if (this.isMapped(prop) || this.isMapped(this.sourceService.getLastUpdateField())) {
      // Not optimal need to reload the object
      let source = await this.sourceService.getObject(uid);
      let updates = {};
      if (this.isMapped(this.sourceService.getLastUpdateField())) {
        updates[this.sourceService.getLastUpdateField()] = updateDate;
      }
      if (this.isMapped(prop)) {
        updates[prop] = source[prop];
      }
      await this.handleMap(source, updates);
    }
  }

  /**
   * Manage one mapping update
   *
   * @param store
   * @param object
   * @param map
   * @param updates
   * @returns
   */
  async handleMap(object: CoreModel, updates: MapUpdates) {
    // Do not process index for now
    if (object.getUuid() === "index") {
      return;
    }
    let mapped = await this.targetStore.get(object[this.parameters.attribute] || updates[this.parameters.attribute]);
    if (mapped === undefined) {
      return;
    }

    if (updates === "created") {
      return this._handleCreatedMap(object, mapped);
    } else if (updates == "deleted") {
      return this._handleDeletedMap(object, mapped);
    } else if (typeof updates == "object") {
      return this._handleUpdatedMap(object, mapped, updates);
    }
  }
  /**
   * Recompute the whole
   */
  async recompute() {}

  /**
   * Override
   */
  static getModda() {
    return {
      uuid: "Webda/Mapper",
      label: "Mapper",
      description: "Deduplicate content between models",
      documentation: "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
      logo: "images/icons/filedb.png"
    };
  }
}

export { MapperService };
