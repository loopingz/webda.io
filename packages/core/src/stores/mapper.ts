import { CoreModel, ModelRef } from "../models/coremodel";
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
export class MapperParameters extends ServiceParameters {
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
   * Async
   *
   * @default false
   */
  async: boolean;
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
  /**
   * Delete source if target object is deleted
   */
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
 * @WebdaModda Mapper
 */
export default class MapperService<T extends MapperParameters = MapperParameters> extends Service<T> {
  @Inject("params:target")
  targetStore: Store<CoreModel & { [key: string]: any[] }>;

  @Inject("params:source")
  sourceService: Store;

  /**
   * @override
   */
  loadParameters(params: any) {
    return new MapperParameters(params);
  }

  /**
   * @override
   */
  resolve(): this {
    super.resolve();
    this.targetStore.addReverseMap(this.parameters.targetAttribute, this.sourceService);
    const method = this.parameters.async ? "onAsync" : "on";
    this.sourceService[method]("Store.PartialUpdated", async (evt: EventStorePartialUpdated) => {
      let prop;
      if (evt.partial_update.increments) {
        prop = evt.partial_update.increments.map(c => c.property);
      } else if (evt.partial_update.addItem) {
        prop = evt.partial_update.addItem.property;
      } else if (evt.partial_update.deleteItem) {
        prop = evt.partial_update.deleteItem.property;
      }
      await this._handleMapFromPartial(evt.object_id, evt.updateDate, prop);
    });
    this.sourceService[method]("Store.Saved", async (evt: EventStoreSaved) => {
      await this.handleMap(evt.object, "created");
    });
    this.sourceService[method]("Store.Update", async (evt: EventStoreUpdate) => {
      await this.handleMap(evt.object, evt.update);
    });
    this.sourceService[method]("Store.PatchUpdate", async (evt: EventStoreUpdate) => {
      await this.handleMap(evt.object, evt.update);
    });
    this.sourceService[method]("Store.Delete", async (evt: EventStoreDeleted) => {
      await this.handleMap(evt.object, "deleted");
    });
    // Cascade delete when target is destroyed
    if (this.parameters.cascade) {
      this.targetStore[method]("Store.Deleted", async (evt: EventStoreDeleted) => {
        let maps = evt.object[this.parameters.targetAttribute];
        if (!maps) {
          return;
        }
        await Promise.all(maps.map(mapper => this.sourceService.cascadeDelete(mapper, evt.object.getUuid())));
      });
    }
    return this;
  }

  /**
   * Get index of the mapper for an object
   * @param map
   * @param uuid
   * @returns
   */
  getMapper(map: any[], uuid: string): number {
    for (let i = 0; i < map.length; i++) {
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
    let mapper: Mapper = {
      // TODO Move to getFullUuid
      uuid: object.getUuid()
    };
    let found = false;
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

  /**
   * Update a mapper after source object was modified
   *
   * @param source
   * @param target
   * @param mapper
   * @returns
   */
  async _handleUpdatedMap(source: CoreModel, target: CoreModel, updates: any) {
    let [mapper, found] = this.createMapper(source, updates);

    // Linked object has not changed, check if map has changed and require updates
    if (!found) {
      // None of the mapped keys has been modified -> return
      return;
    }
    return this._handleUpdatedMapMapper(source, target, mapper);
  }

  /**
   * Update a mapper after source object was modified without change in target
   *
   * @param source
   * @param target
   * @param mapper
   * @returns
   */
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

  /**
   * Remove the mapper for a deleted object
   *
   * @param source
   * @param target
   * @returns
   */
  async _handleDeletedMap(source: CoreModel, target: CoreModel) {
    // Remove from the collection
    if (target[this.parameters.targetAttribute] === undefined) {
      return;
    }
    let i = this.getMapper(target[this.parameters.targetAttribute], source.getUuid());
    if (i >= 0) {
      return this.targetStore.deleteItemFromCollection(
        target.getUuid(),
        this.parameters.targetAttribute,
        i,
        source.getUuid(),
        "uuid"
      );
    }
  }

  /**
   * Add the mapper for a newly created object
   *
   * @param source
   * @param target
   * @returns
   */
  async _handleCreatedMap(source: CoreModel, target: CoreModel) {
    // Add to the object
    let [mapper] = this.createMapper(source, {});
    return this.targetStore.upsertItemToCollection(target.getUuid(), this.parameters.targetAttribute, mapper);
  }

  /**
   * Return true if property belongs to the mapped properties
   *
   * @param property
   * @returns
   */
  isMapped(property: string): boolean {
    return this.parameters.fields.includes(property);
  }

  /**
   * Handle the map from a partial update
   *
   * @param uid
   * @param updateDate
   * @param prop
   */
  async _handleMapFromPartial(uid: string, updateDate: Date, property: string | string[] = undefined) {
    const props: string[] = Array.isArray(property) ? property : [property];
    if (props.find(p => this.isMapped(p)) || this.isMapped(this.sourceService.getLastUpdateField())) {
      // Not optimal need to reload the object
      let source = await this.sourceService.getObject(uid);
      let updates = {};
      if (this.isMapped(this.sourceService.getLastUpdateField())) {
        updates[this.sourceService.getLastUpdateField()] = updateDate;
      }
      props
        .filter(prop => this.isMapped(prop))
        .forEach(prop => {
          if (this.isMapped(prop)) {
            updates[prop] = source[prop];
          }
        });
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
    let attribute = object[this.parameters.attribute] || updates[this.parameters.attribute];
    let mappeds = [];
    let toDelete = [];
    let toAdd = [];
    let ids = [];
    // Manage the update of linked object
    if (typeof attribute === "string" || attribute instanceof ModelRef) {
      attribute = attribute.toString();
      if (updates[this.parameters.attribute] !== undefined && updates[this.parameters.attribute] !== attribute) {
        toAdd.push(updates[this.parameters.attribute].toString());
        toDelete.push(attribute);
      } else {
        ids.push(attribute);
      }
    } else {
      if (Array.isArray(attribute)) {
        ids = attribute;
        if (typeof updates == "object" && updates[this.parameters.attribute]) {
          let refs = updates[this.parameters.attribute];
          toAdd = refs.filter(id => !ids.includes(id));
          toDelete = attribute.filter(id => !refs.includes(id));
        }
      } else if (typeof attribute === "object") {
        ids = Object.keys(attribute);
        if (typeof updates == "object" && updates[this.parameters.attribute]) {
          let refs = Object.keys(updates[this.parameters.attribute]);
          toAdd = refs.filter(id => !ids.includes(id));
          toDelete = ids.filter(id => !refs.includes(id));
        }
      }
    }
    mappeds = await Promise.all([
      ...ids.map(i => this.targetStore.get(i)),
      ...toDelete.map(i => this.targetStore.get(i)),
      ...toAdd.map(i => this.targetStore.get(i))
    ]);
    await Promise.all(
      mappeds
        .filter(a => a !== undefined)
        .map(mapped => {
          if (updates === "created" || toAdd.includes(mapped.getUuid())) {
            return this._handleCreatedMap(object, mapped);
          } else if (updates == "deleted" || toDelete.includes(mapped.getUuid())) {
            return this._handleDeletedMap(object, mapped);
          } else if (typeof updates == "object") {
            return this._handleUpdatedMap(object, mapped, updates);
          }
        })
    );
  }

  /**
   * Recompute the whole mappers
   */
  async recompute() {
    // TODO Implement
  }
}

export { MapperService };
