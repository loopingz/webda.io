import { CoreModel, CoreModelDefinition } from "../models/coremodel";
import { Service } from "../services/service";
import { EventStorePartialUpdated, EventStorePatchUpdated } from "./store";

export interface Mapper {
  modelAttribute: string;
  model: CoreModelDefinition<CoreModel>;
  attributes: string[];
  attribute: string;
}

export class ModelMapper extends Service {
  mappers: {
    [key: string]: {
      modelAttribute: string;
      model: CoreModelDefinition<CoreModel>;
      attributes: string[];
      attribute: string;
    }[];
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
        this.mappers[mapper.model].push({
          attribute: mapper.targetLink,
          attributes: mapper.targetAttributes,
          model: targetModel,
          modelAttribute: mapper.attribute
        });
      }
    }
    this.log("INFO", "Add listeners for", this.mappers);
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
        return this.handleEvent(modelName, evt, "Store.PatchUpdated");
      });
      model.on("Store.PartialUpdated", async evt => {
        return this.handleEvent(modelName, evt, "Store.PartialUpdated");
      });
    }
    return this;
  }

  async handleEvent(
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
    const p = [];
    for (let mapper of this.mappers[modelName]) {
      if (type === "Store.Deleted") {
        const targetModel = await evt.object[mapper.attribute]?.get();
        if (!targetModel) continue;
        const ind = targetModel[mapper.modelAttribute].findIndex(p => p.uuid === uuid);
        this.log("TRACE", "Should delete a mapper to object", mapper, evt.object[mapper.attribute], ind);
        if (ind >= 0) {
          p.push(
            mapper.model
              .ref(evt.object[mapper.attribute])
              .deleteItemFromCollection(<any>mapper.modelAttribute, ind, uuid, "uuid")
          );
        }
        continue;
      } else if (type === "Store.Saved") {
        if (evt.object[mapper.attribute]?.toString() === undefined) continue;
        p.push(
          mapper.model
            .ref(evt.object[mapper.attribute])
            .upsertItemToCollection(<any>mapper.modelAttribute, this.getMapper(evt.object, mapper))
        );
        continue;
      } else if (type === "Store.Updated") {
        const targetModel = await evt.object[mapper.attribute]?.get();
        if (!targetModel) continue;
        const ind = targetModel[mapper.modelAttribute].findIndex(p => p.uuid === uuid);
        this.log("TRACE", "Should update a mapper based on Store.Updated", targetModel[mapper.modelAttribute], uuid);
        if (ind >= 0) {
          p.push(
            mapper.model
              .ref(evt.object[mapper.attribute])
              .upsertItemToCollection(<any>mapper.modelAttribute, this.getMapper(evt.object, mapper), ind, uuid, "uuid")
          );
        } else {
          p.push(
            mapper.model
              .ref(evt.object[mapper.attribute])
              .upsertItemToCollection(<any>mapper.modelAttribute, this.getMapper(evt.object, mapper))
          );
        }
      } else if (type === "Store.PartialUpdated" || type === "Store.PatchUpdated") {
        this.log("TRACE", "Should update a mapper based on Store.PartialUpdated", evt);
        const partial: EventStorePartialUpdated = evt;
        // Search if one property is mapped then redirect to Store.Updated
        if (mapper.attributes.find(p => attributes.find(i => i === p))) {
          const object = await partial.store.get(uuid);
          return await this.handleEvent(modelName, { object }, "Store.Updated");
        }
      }
    }
    return await Promise.all(p);
  }

  getMapper(model: any, mapper: Mapper): any {
    let obj = {};
    for (let attr of mapper.attributes) {
      obj[attr] = model[attr];
    }
    obj["uuid"] = model.getUuid();
    return obj;
  }
}
