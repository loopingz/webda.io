import { CoreModel, CoreModelDefinition } from "../models/coremodel";
import { Service } from "../services/service";

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
      app.getModel(modelName).on("Store.Deleted", async evt => {
        this.log("INFO", "Delete", modelName);
        const uuid = evt.object.getUuid();
        let p = [];
        for (let mapper of this.mappers[modelName]) {
          const model = await mapper.model.ref(evt.object[mapper.modelAttribute]).get();
          let id = (<any[]>model[mapper.attribute] || []).findIndex(p => p.uuid == uuid);
          if (id >= 0) {
            p.push(
              model.__class.ref(uuid).deleteItemFromCollection(<any>mapper.attribute, id, evt.object.getUuid(), "uuid")
            );
          }
        }
        // Could use throttler if needed
        await Promise.all(p);
      });
    }
    return this;
  }
}
