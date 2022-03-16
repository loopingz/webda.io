import { CoreModel } from "../models/coremodel";
import MapperService, { MapperParameters, MapUpdates } from "./mapper";

export class AggregatorParameters extends MapperParameters {
  /**
   * @default index
   */
  key: string;

  constructor(params: any) {
    super(params);
    this.key ??= "index";
  }
}

/**
 * Service that aggregate several CoreModel into one
 *
 * Similar to a Mapper except that the target is constant
 *
 * @WebdaModda Aggregator
 */
export default class AggregatorService<T extends AggregatorParameters = AggregatorParameters> extends MapperService<T> {
  /**
   * Create index if not existing
   *
   * @inheritdoc
   */
  async init(): Promise<void> {
    await this.createAggregate();
  }

  /**
   * @override
   */
  loadParameters(params: any) {
    return new AggregatorParameters(params);
  }

  /**
   * Make sure the aggregate document exist
   */
  async createAggregate() {
    if (!(await this.targetStore.exists(this.parameters.key))) {
      await this.targetStore.save({
        uuid: this.parameters.key
      });
    }
  }

  /**
   * Create an aggregation
   *
   * @param object
   * @param updates
   * @returns
   */
  async handleMap(object: CoreModel, updates: MapUpdates) {
    let mapUpdates: any = {};
    if (typeof updates === "object") {
      let toUpdate = false;
      for (let i in updates) {
        if (this.parameters.fields.indexOf(i) >= 0) {
          toUpdate = true;
        }
      }
      if (!toUpdate) {
        return;
      }
    } else if (updates === "deleted") {
      await this.targetStore.removeAttribute(this.parameters.key, object.getUuid());
      return;
    } else if (updates === "created") {
      updates = object;
    }
    // Create mapper
    let mapper = {};
    this.parameters.fields.forEach(id => {
      mapper[id] = updates[id];
    });
    mapUpdates[object.getUuid()] = mapper;
    mapUpdates._lastUpdate = new Date();
    await this.targetStore._patch(mapUpdates, this.parameters.key);
  }
}

export { AggregatorService };
