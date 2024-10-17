import { CloudEvent } from "cloudevents";

export type WebdaScope = "public" | "global" | "local";

const Emitters = new WeakMap<Function, Function[]>();

/**
 * WebdaEvent is the base class for all events
 *
 * @category CoreFeatures
 */
abstract class WebdaEvent<T = undefined> {
  cloudEvent: CloudEvent<T>;
  /**
   * Create a new WebdaEvent
   *
   * @param event
   * @param source
   * @param scope
   */
  constructor(
    event: Partial<CloudEvent<T>>,
    source: any,
    public scope: WebdaScope
  ) {
    if (!(Emitters.get(source.constructor) || []).includes(this.constructor)) {
      console.log(source.constructor.Emits, this.constructor);
      throw new Error(`Source ${source.constructor.name} should declare the events it emits (${this.constructor.name})`)
    }
    this.cloudEvent = new CloudEvent({
      type: "io.webda.event",
      datacontenttype: "application/json",
      source: event.source || WebdaEvent.getSourceId(source),
      ...event
    });
  }

  /**
   * Get the source id
   * @param source
   * @returns
   */
  static getSourceId(source: any) {
    /*
    if (source instanceof CoreModel) {
      return `model/${source.__class.getIdentifier()}/${source.getUuid()}`;
    }
    if (source instanceof Service) {
      return `service/${source.getName()}`;
    }
    */
    return `service/core`;
  }

  /**
   *
   * @param source
   * @param scope
   * @returns
   */
  static getFilter(source?: any): string {
    return "";
  }

  /**
   * Emit the event
   * @param ensureDelivery
   * @returns
   */
  async emit(ensureDelivery: boolean = true) {
    // Local events
    if (this.scope === "local") {
      return this;
    }
    await this.cloudEvent.emit(ensureDelivery);
    return this;
  }

  /**
   * Unserialize the event from string
   * @returns
   */
  static unserialize<T extends WebdaEvent>(data: string): T {
    return JSON.parse(data) as T;
  }

  isLocal(): boolean {
    return true;
  }
}

class TestEvent extends WebdaEvent {
  constructor(source: any) {
    super({}, source, "local");
  }
}

class TestEvent2 extends WebdaEvent {
  constructor(source: any) {
    super({}, source, "local");
  }
}

class EventServiceParameters  {
  /**
   * Static list of subscriptions
   */
  subscriptions: any[] = [];
}

/**
 * SubscriptionModel is the base class for all subscriptions
 */
export class Subscription {
  // cloudevents description
  source: "configuration" | "dynamic" = "configuration";
  failures: number = 0;

  subscribe() {

  }
}



/**
 * SubscriptionEvent is the base class for all events
 *
 * @category CoreFeatures
 */
export class SubscriptionEvent extends WebdaEvent {
  constructor(event: Partial<CloudEvent>, source: any, scope: WebdaScope) {
    super(event, source, scope);
  }
}

/**
 * EventService is the base class for all event services
 *
 * @category CoreFeatures
 */
export class EventService {
  subscribe(subscription: Subscription) {
    return this;
  }

  emit(event: WebdaEvent) {
    // Emit the event
    // might want to append: app/${uuid}/node/${uuid}/
  }
}

type Constructor<T = {}> = new (...args: any[]) => T;
// Will define a global pub/sub
// Will define an event to queues
// Will

function Emits(events: Constructor<WebdaEvent>[]) {
  return function (constructor: Function, ...args: any[]) {
    Emitters.set(constructor, events);
  }
}

// io.webda.models.test.create -> app/${uuid}/node/${uuid}/model/${uuid}
// io.webda.models.test.update -> app/${uuid}/node/${uuid}/model/${uuid}
// io.webda.models.test.delete -> app/${uuid}/node/${uuid}/model/${uuid}
// io.webda.models.test.get -> app/${uuid}/node/${uuid}/model/${uuid}

// io.webda.services.test.create -> service/${name}

@Emits([TestEvent])
class Test {
  async run() {
    console.log("Emitting TestEvent");
    await new TestEvent(this).emit();
    console.log("Emitted TestEvent");
    console.log("Emitting TestEvent2");
    //await new TestEvent2(this).emit();
    console.log("Emitted TestEvent2");
  }
}

console.log("TESTOR");
new Test().run();

console.log(Emitters);