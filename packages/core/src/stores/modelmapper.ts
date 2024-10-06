import type { CoreModel, CoreModelEvents, ModelRef } from "../models/coremodel";
import type { CoreModelDefinition } from "../models/coremodel";
import { Service } from "../services/service";

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
    for (const i in graph) {
      if (!graph[i].maps) continue;
      const targetModel = app.getModel(i);
      for (const j in graph[i].maps) {
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
    for (const modelName in this.mappers) {
      const model = app.getModel(modelName);
      model.on("Delete", async evt => {
        await this.handleEvent(modelName, evt, "Deleted");
      });
      model.on("Create", async evt => {
        await this.handleEvent(modelName, evt, "Created");
      });
      model.on("Update", async evt => {
        await this.handleEvent(modelName, evt, "Updated");
      });
      model.on("PartialUpdate", async evt => {
        await this.handlePartialEvent(modelName, evt);
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
    type: "Created" | "Deleted" | "Updated" | "PatchUpdated" | "PartialUpdated"
  ) {
    const p = [];
    for (const mapper of this.mappers[modelName]) {
      // For each mapper we identify uuid to add mapper to, uuid to remove mapper from and uuid to update
      const toAdds = [];
      const toRemoves = [];
      const toUpdates = [];
      if (type === "Created") {
        toAdds.push(...this.getUuidsFromMapper(evt.object, mapper));
      } else if (type === "Deleted") {
        toRemoves.push(...this.getUuidsFromMapper(evt.object, mapper));
      } else if (type === "Updated") {
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
  async handlePartialEvent(modelName: string, evt: CoreModelEvents["PartialUpdate"]) {
    let uuid = evt.object_id;
    // Only use in Store.PartialUpdated
    const attributes = [];
    if (evt.partial_update.increments) {
      attributes.push(...evt.partial_update.increments.map(p => p.property));
    }
    if (evt.partial_update.deleteAttribute) {
      attributes.push(evt.partial_update.deleteAttribute);
    }
    if (evt.partial_update.patch) {
      attributes.push(...Object.keys(evt.partial_update.patch));
    }
    uuid = evt.object_id;

    for (const mapper of this.mappers[modelName]) {
      this.log("TRACE", "Should update a mapper based on Store.PartialUpdated", evt);
      // Search if one property is mapped then redirect to Store.Updated
      if (mapper.attributes.find(p => attributes.find(i => i === p))) {
        const Model = this._webda.getApplication().getModel(modelName);
        const instance = await Model.ref(uuid).get();
        return await this.handleEvent(modelName, { object: instance, previous: instance }, "Updated");
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
    const obj = {};
    for (const attr of mapper.attributes) {
      obj[attr] = model[attr];
    }
    obj["uuid"] = model.getUuid();
    return obj;
  }
}
