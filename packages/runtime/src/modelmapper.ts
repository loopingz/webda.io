import { useApplication, useModel } from "../application/hook";
import type { ModelEvents } from "@webda/models";
import { ModelClass, ServicePartialParameters } from "../internal/iapplication";
import { ModelRef } from "@webda/models";
import { Service } from "../services/service";
import { ServiceParameters } from "../interfaces";
import { Model } from "@webda/models";

export interface Mapper {
  modelAttribute: string;
  model: ModelClass<Model>;
  attributes: string[];
  attribute: string;
}

interface ModelMapperInfo {
  modelAttribute: string;
  model: ModelClass<Model>;
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
  /**
   * Build the mapper graph from model metadata and register event listeners on mapped models
   * @returns this instance for chaining
   */
  resolve() {
    super.resolve();
    const app = useApplication();
    const graph: ModelClass<Model>[] = Object.values(app.getModels()).filter(
      (p: ModelClass) => p.Metadata.Relations.maps
    );
    for (const i in graph) {
      const targetModel = graph[i];
      for (const j in graph[i].Metadata.Relations.maps) {
        const mapper = graph[i].Metadata.Relations.maps[j];
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
   * @param object - the source model instance to extract linked UUIDs from
   * @param mapper - mapper definition describing the link type and attribute
   * @returns array of UUID strings for all linked models (empty values filtered out)
   */
  getUuidsFromMapper(object: Model, mapper: ModelMapperInfo) {
    const targetUuids = [];
    if (mapper.type === "LINK") {
      targetUuids.push(object[mapper.attribute]?.getUUID());
    } else if (mapper.type === "LINKS_MAP") {
      targetUuids.push(
        ...Object.values(object[mapper.attribute]).map((p: ModelRef<Model>) => p.getPrimaryKey().toString())
      );
    } else {
      targetUuids.push(
        ...object[mapper.attribute].map(p => (typeof p === "string" ? p : p.getPrimaryKey().toString()))
      );
    }
    return targetUuids.filter(p => p);
  }

  /**
   * Load and validate service parameters
   * @param params - raw partial parameters from configuration
   * @returns initialized ServiceParameters instance
   */
  loadParameters(params: ServicePartialParameters<ServiceParameters>): ServiceParameters {
    return new ServiceParameters().load(params);
  }
  /**
   * Handle a model lifecycle event by updating mapped collections (add/remove/update)
   * @param modelName - fully-qualified model identifier
   * @param evt - event payload containing object and previous state
   * @param type - lifecycle event type (Created, Deleted, Updated, etc.)
   * @returns promise resolving when all collection updates complete
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
   * Handle partial update event — checks if any mapped attribute changed and
   * falls back to a full update if so
   *
   * @param modelName - fully-qualified model identifier
   * @param evt - partial update event with increments/patches/deletes
   * @returns promise resolving when the update is handled (or void if no mapped attribute changed)
   */
  async handlePartialEvent(modelName: string, evt: ModelEvents["PartialUpdate"]) {
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
        const Model = useModel(modelName);
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
   * @param model - source model instance to extract mapped attributes from
   * @param mapper - mapper definition listing which attributes to copy
   * @returns plain object with the mapped attributes and the model's uuid
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
