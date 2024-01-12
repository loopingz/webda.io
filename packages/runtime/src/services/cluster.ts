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
export interface ClusterMessage {
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
  /**
   * Display code alert when code is out of sync
   *
   * Can be disabled by setting it to false - in case different code is subscribing to
   * the same pubsub
   *
   * If undefined it will display the alert only once
   *
   * true will force it to display every time
   * @param params
   */
  unsyncCodeAlert?: boolean;

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
   * If code is out of sync and warning has been displayed
   */
  hasCodeSyncAlert: boolean = false;

  /**
   * Cluster member
   */
  members: {
    [key: string]: {
      lastSeen: number;
      /**
       * Any data you want to store on the member
       */
      [key: string]: any;
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
   * Node data to send to other nodes
   */
  nodeData: any = {};

  /**
   * Return cluster members
   * @returns
   */
  getMembers() {
    return { ...this.members, [this.emitterId]: { lastSeen: Date.now(), ...this.nodeData } };
  }

  /**
   * @override
   */
  loadParameters(params: DeepPartial<T>): ServiceParameters {
    this.emitterId = Core.getMachineId();
    this.log("DEBUG", `Cluster emitterId ${this.emitterId}`);
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

    this.models = this.getWebda().getModels();
    for (let i in this.models) {
      for (let event of this.models[i].getClientEvents()) {
        this.models[i].on(<any>event, data => {
          this.sendMessage({
            event: typeof event === "string" ? event : event.name,
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
   * Allow to set some data on the member
   * @param data
   * @param erase will remove any other data
   */
  setMemberInfo(data: any = {}, erase?: boolean) {
    this.nodeData = erase ? data : { ...this.nodeData, ...data };
  }

  /**
   * Return the keep alive message to be sent
   *
   * Useful to override to add some dynamic data
   * If the data is static you can use setMemberInfo
   * @returns
   */
  async getKeepAliveMessage(): Promise<Partial<ClusterMessage>> {
    return {
      event: "ClusterService.MemberKeepAlive",
      data: {
        ...this.nodeData
      },
      type: "cluster"
    };
  }

  /**
   * Send a keep alive on pub/sub and remove any member that we haven't seen in the last 64s -> missed 2 ttl
   */
  async updateCluster(): Promise<void> {
    let time = Date.now();
    const keepAliveEvent: Partial<ClusterMessage> = await this.getKeepAliveMessage();
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
  async sendMessage(message: Partial<ClusterMessage>, force?: boolean): Promise<void> {
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
    await this.pubSub.sendMessage(<ClusterMessage>{ ...message, emitterId: this.emitterId, time: Date.now() });
  }

  resolve(): this {
    super.resolve();
    const packageInfo = this.getWebda().getApplication().getPackageDescription();
    // By default we will send the package name and version and any CLUSTER_* variables
    this.nodeData = {
      version: packageInfo.version,
      packageName: packageInfo.name,
      id: this.emitterId,
      name: process.env.HOSTNAME || process.env.HOST || "unknown",
      ...Object.keys(process.env)
        .filter(key => key.startsWith("CLUSTER_"))
        .reduce((acc, key) => {
          acc[key.substring(8)] = process.env[key];
          return acc;
        }, {})
    };
    return this;
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
      const shouldAlert =
        !this.models[message.emitter] &&
        ((this.parameters.unsyncCodeAlert === undefined && this.hasCodeSyncAlert === false) ||
          this.parameters.unsyncCodeAlert);
      if (shouldAlert) {
        this.hasCodeSyncAlert = true;
        this.log("WARN", `Model not found ${message.emitter} - code is probably out of sync`);
        return;
      }
      model.emit(<any>message.event, data);
    } else if (message.type === "store") {
      const shouldAlert =
        !this.stores[message.emitter] &&
        ((this.parameters.unsyncCodeAlert === undefined && this.hasCodeSyncAlert === false) ||
          this.parameters.unsyncCodeAlert);
      if (shouldAlert) {
        this.hasCodeSyncAlert = true;
        this.log("WARN", `Store not found ${message.emitter} - code is probably out of sync`);
        return;
      }
      // Store will emit the event but manage the cache first
      await this.stores[message.emitter]?.emitStoreEvent(<any>message.event, data);
    } else if (message.type === "service") {
      const shouldAlert =
        !this.services[message.emitter] &&
        ((this.parameters.unsyncCodeAlert === undefined && this.hasCodeSyncAlert === false) ||
          this.parameters.unsyncCodeAlert);
      if (shouldAlert) {
        this.hasCodeSyncAlert = true;
        this.log("WARN", `Service not found ${message.emitter} - code is probably out of sync`);
        return;
      }
      this.services[message.emitter].emit(message.event, data);
    } else if (message.type === "cluster") {
      if (message.event === "ClusterService.MemberRemoved" && message.data.emitterId === this.emitterId) {
        this.log("WARN", "Received a ClusterService.MemberRemoved for myself - sending a KeepAlive");
        this.updateCluster();
      } else if (message.event === "ClusterService.MemberKeepAlive") {
        this.members[message.emitterId] = { ...message.data, lastSeen: Date.now() };
      }
    }
  }
}
