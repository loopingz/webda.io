import { CoreModel, CoreModelDefinition, ModelRef } from "../models/coremodel";
import { Service } from "../services/service";
import { EventStorePartialUpdated, EventStorePatchUpdated } from "./store";

export interface Mapper {
  modelAttribute: string;
  model: CoreModelDefinition<CoreModel>;
  attributes: string[];
  attribute: string;
}

interface ModelMapperInfo {
  modelAttribute: string;
  model: CoreModelDefinition<CoreModel>;
  attributes: string[];
  attribute: string;
  type: "LINK" | "LINKS_MAP" | "LINKS_ARRAY" | "LINKS_SIMPLE_ARRAY";
}

/**
 * Mapper service
 *
 * Ensure each ModelMapped properties is in-sync with their respective model
 */
export class ModelMapper extends Service {
  mappers: {
    [key: string]: ModelMapperInfo[];
  } = {};
  resolve() {
    super.resolve();
    const app = this.getWebda().getApplication();
    const graph = app.getGraph();
    for (let i in graph) {
      if (!graph[i].maps) continue;
      this.log("INFO", i, graph[i].maps);
      const targetModel = app.getModel(i);
      for (let j in graph[i].maps) {
        const mapper = graph[i].maps[j];
        this.mappers[mapper.model] ??= [];
        // Search for links
        this.mappers[mapper.model].push({
          attribute: mapper.targetLink,
          attributes: mapper.targetAttributes,
          model: targetModel,
          modelAttribute: mapper.attribute,
          type: graph[mapper.model].links?.find(p => p.attribute === mapper.targetLink)?.type || "LINK"
        });
      }
    }
    for (let modelName in this.mappers) {
      const model = app.getModel(modelName);
      model.on("Store.Deleted", async evt => {
        return this.handleEvent(modelName, evt, "Store.Deleted");
      });
      model.on("Store.Saved", async evt => {
        return this.handleEvent(modelName, evt, "Store.Saved");
      });
      model.on("Store.Updated", async evt => {
        return this.handleEvent(modelName, evt, "Store.Updated");
      });
      model.on("Store.PatchUpdated", async evt => {
        return this.handlePartialEvent(modelName, evt, "Store.PatchUpdated");
      });
      model.on("Store.PartialUpdated", async evt => {
        return this.handlePartialEvent(modelName, evt, "Store.PartialUpdated");
      });
    }
    return this;
  }

  /**
   * Get uuids from a ModelLinker
   * @param object
   * @param mapper
   * @returns
   */
  getUuidsFromMapper(object: CoreModel, mapper: ModelMapperInfo) {
    const targetUuids = [];
    if (mapper.type === "LINK") {
      targetUuids.push(object[mapper.attribute]?.getUuid());
    } else if (mapper.type === "LINKS_MAP") {
      targetUuids.push(...Object.values(object[mapper.attribute]).map((p: ModelRef<CoreModel>) => p.getUuid()));
    } else {
      targetUuids.push(...object[mapper.attribute].map(p => (typeof p === "string" ? p : p.getUuid())));
    }
    return targetUuids.filter(p => p);
  }

  /**
   * Handle event
   * @param modelName
   * @param evt
   * @param type
   * @returns
   */
  async handleEvent(
    modelName: string,
    evt: any,
    type: "Store.Saved" | "Store.Deleted" | "Store.Updated" | "Store.PatchUpdated" | "Store.PartialUpdated"
  ) {
    let p = [];
    for (let mapper of this.mappers[modelName]) {
      // For each mapper we identify uuid to add mapper to, uuid to remove mapper from and uuid to update
      const toAdds = [];
      const toRemoves = [];
      const toUpdates = [];
      if (type === "Store.Saved") {
        toAdds.push(...this.getUuidsFromMapper(evt.object, mapper));
      } else if (type === "Store.Deleted") {
        toRemoves.push(...this.getUuidsFromMapper(evt.object, mapper));
      } else if (type === "Store.Updated") {
        const oldUuids = this.getUuidsFromMapper(evt.previous, mapper);
        const newUuids = this.getUuidsFromMapper(evt.object, mapper);
        oldUuids.forEach(u => {
          if (newUuids.includes(u)) {
            toUpdates.push(u);
          } else {
            toRemoves.push(u);
          }
        });
        newUuids.forEach(u => {
          if (!oldUuids.includes(u)) {
            toAdds.push(u);
          }
        });
      }
      const mapped = this.getMapped(evt.object, mapper);
      // Add all promise
      toAdds.forEach(u => {
        p.push(mapper.model.ref(u).upsertItemToCollection(<any>mapper.modelAttribute, mapped));
      });
      // Remove all promise
      toRemoves.forEach(u => {
        p.push(
          (async () => {
            const targetModel = await mapper.model.ref(u).get();
            if (!targetModel) return;
            const ind = targetModel[mapper.modelAttribute].findIndex(p => p.uuid === evt.object.getUuid());
            if (ind >= 0) {
              await mapper.model.ref(u).deleteItemFromCollection(<any>mapper.modelAttribute, ind, evt.object.getUuid());
            }
          })()
        );
      });
      // Update all promise
      toUpdates.forEach(u => {
        p.push(
          (async () => {
            const targetModel = await mapper.model.ref(u).get();
            if (!targetModel) return;
            const ind = targetModel[mapper.modelAttribute].findIndex(p => p.uuid === evt.object.getUuid());
            if (ind >= 0) {
              await mapper.model
                .ref(u)
                .upsertItemToCollection(<any>mapper.modelAttribute, mapped, ind, evt.object.getUuid());
            }
          })()
        );
      });
    }
    return Promise.all(p);
  }

  /**
   * Handle partial event to update a mapper
   *
   * @param modelName
   * @param evt
   * @param type
   * @returns
   */
  async handlePartialEvent(
    modelName: string,
    evt: any,
    type: "Store.Saved" | "Store.Deleted" | "Store.Updated" | "Store.PatchUpdated" | "Store.PartialUpdated"
  ) {
    let uuid = evt.object?.getUuid();
    // Only use in Store.PartialUpdated
    const attributes = [];
    if (type === "Store.PartialUpdated") {
      const partial: EventStorePartialUpdated = evt;
      if (partial.partial_update.increments) {
        attributes.push(...partial.partial_update.increments.map(p => p.property));
      }
      if (partial.partial_update.deleteAttribute) {
        attributes.push(partial.partial_update.deleteAttribute);
      }
      uuid = partial.object_id;
    } else if (type === "Store.PatchUpdated") {
      attributes.push(...Object.keys((<EventStorePatchUpdated>evt).object));
    }
    for (let mapper of this.mappers[modelName]) {
      this.log("TRACE", "Should update a mapper based on Store.PartialUpdated", evt);
      const partial: EventStorePartialUpdated = evt;
      // Search if one property is mapped then redirect to Store.Updated
      if (mapper.attributes.find(p => attributes.find(i => i === p))) {
        const object = await partial.store.get(uuid);
        return await this.handleEvent(modelName, { object, previous: object }, "Store.Updated");
      }
    }
  }

  /**
   * Get a mapped object based on Mapper
   *
   * Copy attributes that are supposed to be copied
   *
   * @param model
   * @param mapper
   * @returns
   */
  getMapped(model: any, mapper: Mapper): any {
    let obj = {};
    for (let attr of mapper.attributes) {
      obj[attr] = model[attr];
    }
    obj["uuid"] = model.getUuid();
    return obj;
  }
}
