import {
  Core,
  CoreModelDefinition,
  DeepPartial,
  Gauge,
  Inject,
  PubSubService,
  Route,
  Service,
  ServiceParameters,
  Store,
  WebContext
} from "@webda/core";

/**
 * Message going through our pub/sub
 */
interface ClusterMessage {
  /**
   * Event name
   */
  event: string;
  /**
   * Event data
   */
  data: any;
  /**
   * Emitter id
   */
  emitterId: string;
  /**
   * Emitter name
   */
  emitter: string;
  /**
   * Time of the event
   */
  time: number;
  /**
   * Type of event
   */
  type: "model" | "service" | "cluster" | "store";
}

const storeEvents = ["Store.PartialUpdated", "Store.Saved", "Store.PatchUpdated", "Store.Updated", "Store.Deleted"];

export class ClusterServiceParameters extends ServiceParameters {
  /**
   * @default PubSub
   */
  pubsub: string;
  /**
   * @default twice keepAlive
   */
  ttl: number;
  /**
   * @default 30000
   */
  keepAlive: number;

  constructor(params: any) {
    super(params);
    this.keepAlive ??= 30000;
    this.ttl ??= this.keepAlive * 2;
    this.pubsub ??= "PubSub";
  }
}

/**
 * Cluster service
 *
 * It will listen to all events and forward them to the pubsub
 * so all others instances can be notified
 * It will emit the event locally received from the pubsub
 *
 * It will also invalidates cache based on these events
 *
 * @WebdaModda
 */
export class ClusterService<T extends ClusterServiceParameters = ClusterServiceParameters> extends Service<T> {
  @Inject("params:pubsub", "PubSub")
  pubSub: PubSubService<ClusterMessage>;

  /**
   * Cluster member
   */
  members: {
    [key: string]: {
      lastSeen: number;
    };
  } = {};
  /**
   * Emitter id
   */
  emitterId: string;

  /**
   * Models defined in the app
   */
  models: {
    [key: string]: CoreModelDefinition;
  };
  /**
   * Services defined in the app
   */
  services: { [key: string]: Service };

  /**
   * Stores defined in the app
   */
  stores: { [key: string]: Store };

  metrics: {
    members: Gauge;
  };
  /**
   * If service is ready
   *
   * Sent the welcome message
   */
  _ready: boolean = false;

  /**
   * Return cluster members
   * @returns
   */
  getMembers() {
    return { ...this.members, [this.emitterId]: { lastSeen: Date.now() } };
  }

  /**
   * @override
   */
  loadParameters(params: DeepPartial<T>): ServiceParameters {
    return new ClusterServiceParameters(params);
  }

  /**
   * Add a prometheus gauge for members in the cluster
   */
  initMetrics() {
    super.initMetrics();
    this.metrics.members = this.getMetric(Gauge, { name: "members", help: "Number of members in the cluster" });
    this.metrics.members.inc();
  }

  /**
   *
   * @returns
   */
  async init() {
    await super.init();
    //
    this.pubSub = this.getService<PubSubService<ClusterMessage>>("PubSub");
    this.emitterId = Core.getMachineId();
    this.log("DEBUG", `Cluster emitterId ${this.emitterId}`);

    this.models = this.getWebda().getModels();
    for (let i in this.models) {
      for (let event of this.models[i].getClientEvents()) {
        this.models[i].on(<any>event, data => {
          this.sendMessage({
            event,
            data,
            type: "model",
            emitter: i
          });
        });
      }
    }
    this.services = this.getWebda().getServices();
    for (let i in this.services) {
      for (let event of this.services[i].getClientEvents()) {
        if (storeEvents.includes(event)) {
          continue;
        }
        this.services[i].on(event, (data: any) => {
          this.sendMessage({
            event,
            data,
            type: "service",
            emitter: i
          });
        });
      }
    }
    // Store could have been treated like a normal service with emitter/listener
    // Kept the specific because stores are probably quite chatty
    this.stores = this.getWebda().getStores();
    for (let i in this.stores) {
      for (let event of storeEvents) {
        this.stores[i].on(<any>event, (data: any) => {
          this.sendMessage({
            event,
            data,
            type: "store",
            emitter: i
          });
        });
      }
    }
    // Once all services are initialized start using the pub/sub
    this.getWebda().on("Webda.Init.Services", async () => {
      this.pubSub.consume(this.handleMessage.bind(this));
      await this.updateCluster();
      setInterval(() => {
        this.updateCluster();
      }, this.parameters.keepAlive);
      this._ready = true;
    });
    return this;
  }

  /**
   * Send a keep alive on pub/sub and remove any member that we haven't seen in the last 64s -> missed 2 ttl
   */
  async updateCluster(): Promise<void> {
    let time = Date.now();
    const keepAliveEvent = {
      event: "ClusterService.MemberKeepAlive",
      data: {},
      type: "cluster"
    };
    await this.sendMessage(keepAliveEvent, true);
    // Clean members
    time -= this.parameters.ttl;
    for (let i in this.members) {
      if (this.members[i].lastSeen <= time) {
        this.log("INFO", `Lost cluster member ${i} ${Math.floor((time - this.members[i].lastSeen) / 1000)}s ago`);
        this.metrics.members.dec();
        delete this.members[i];
        this.sendMessage(
          {
            type: "cluster",
            event: "ClusterService.MemberRemoved",
            data: { emitterId: i }
          },
          true
        );
      }
    }
  }

  /**
   *
   * @returns
   */
  @Route(".")
  readyEndpoint(ctx: WebContext) {
    if (!this._ready) {
      ctx.writeHead(503);
      return;
    }
    ctx.write({ ready: true });
  }

  /**
   * If service is ready
   * @returns
   */
  ready(): boolean {
    // Could have some state sync
    return this._ready;
  }

  /**
   * Send message to the pub/sub
   * @param message
   * @returns
   */
  async sendMessage(message: any, force?: boolean): Promise<void> {
    // If no other member no point to use the pub/sub
    if (!force && Object.keys(this.members).length === 0) {
      return;
    }
    message.data ??= {};
    // Skip if it's a forwarded event
    if (message.data.emitterId) {
      this.log("DEBUG", "Skip emitted message");
      return;
    }
    await this.pubSub.sendMessage({ ...message, emitterId: this.emitterId, time: Date.now() });
  }

  /**
   * Handle message received by the pub/sub
   * @param message
   * @returns
   */
  protected async handleMessage(message: ClusterMessage) {
    // Skip if we are the emitter
    if (message.emitterId === this.emitterId) {
      this.log("TRACE", "Skipping message: same emitter");
      return;
    }
    // If member is unknown
    if (!this.members[message.emitterId]) {
      this.log("INFO", `Add cluster member ${message.emitterId}`);
      this.metrics.members.inc();
      this.members[message.emitterId] = { lastSeen: Date.now() };
      this.sendMessage(
        {
          type: "cluster",
          event: "ClusterService.MemberAdded",
          data: { emitterId: message.emitterId }
        },
        true
      );
    } else {
      // Update lastSeen
      this.members[message.emitterId].lastSeen = Date.now();
    }

    const data = { ...message.data, emitterId: message.emitterId };
    // Skip if we are too old ?

    // Dispatch the event
    if (message.type === "model") {
      let model = this.models[message.emitter];
      if (!model) {
        this.log("WARN", `Model not found ${message.emitter} - code is probably out of sync`);
        return;
      }
      model.emit(<any>message.event, data);
    } else if (message.type === "store") {
      if (!this.stores[message.emitter]) {
        this.log("WARN", `Store not found ${message.emitter} - code is probably out of sync`);
        return;
      }
      // Store will emit the event but manage the cache first
      await this.stores[message.emitter]?.emitStoreEvent(<any>message.event, data);
    } else if (message.type === "service") {
      if (!this.services[message.emitter]) {
        this.log("WARN", `Service not found ${message.emitter} - code is probably out of sync`);
        return;
      }
      this.services[message.emitter].emit(message.event, data);
    } else if (message.type === "cluster") {
      if (message.event === "ClusterService.MemberRemoved" && message.data.emitterId === this.emitterId) {
        this.log("WARN", "Received a ClusterService.MemberRemoved for myself - sending a KeepAlive");
        this.updateCluster();
      }
    }
  }
}
