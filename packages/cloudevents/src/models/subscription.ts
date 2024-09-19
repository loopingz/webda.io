import { CloudEvent, EmitterFunction, emitterFor, httpTransport } from "cloudevents";
import { Filter, FilterImplementation, FiltersHelper } from "./filters";
import { randomUUID } from "crypto";

/**
 * For HTTP, the following settings properties SHOULD be supported by all implementations.
 */
export interface HttpSettings {
  /**
   * A set of key/value pairs that is copied into the HTTP request as custom headers.
   */
  headers?: { [key: string]: string };
  /**
   * The HTTP method to use for sending the message. This defaults to POST if not set.
   */
  method?: "POST" | "PUT";
}

/**
 * All implementations that support MQTT MUST support the topicname settings.
 * All other settings SHOULD be supported.
 */
export interface MQTTSettings {
  /**
   * The name of the MQTT topic to publish to.
   */
  topicname: string;
  /**
   * MQTT quality of service (QoS) level: 0 (at most once), 1 (at least once), or 2 (exactly once).
   * This defaults to 1 if not set.
   *
   * @default 1
   */
  qos?: number;
  /**
   * MQTT retain flag: true/false. This defaults to false if not set.
   *
   * @default false
   */
  retain?: boolean;
  /**
   * MQTT expiry interval, in seconds. This value has no default value and the message will not expire
   * if the setting is absent. This setting only applies to MQTT 5.0.
   */
  expiry?: number;
  /**
   * A set of key/value pairs that are copied into the MQTT PUBLISH packet's user property section.
   * This setting only applies to MQTT 5.0.
   */
  userproperties?: { [key: string]: string };
}

/**
 * For AMQP, the address property MUST be supported by all implementations and other settings
 * properties SHOULD be supported by all implementations.
 */
export interface AMQPSettings {
  /**
   * The link target node in the AMQP container identified by the sink URI, if not expressed in the
   * sink URI's path portion.
   */
  address?: string;
  /**
   * Name to use for the AMQP link. If not set, a random link name is used.
   */
  linkname?: string;
  /**
   * Allows to control the sender's settlement mode, which determines whether transfers are performed
   * "settled" (without acknowledgement) or "unsettled" (with acknowledgement).
   *
   * @default "unsettled"
   */
  sendersettlementmode?: "settled" | "unsettled";
  /**
   * A set of key/value pairs that are copied into link properties for the send link.
   */
  linkproperties?: { [key: string]: string };
}

/**
 * All implementations that support Apache Kafka MUST support the topicname settings.
 * All other settings SHOULD be supported.
 */
export interface KafkaSettings {
  /**
   * The name of the Kafka topic to publish to.
   */
  topicname?: string;
  /**
   * A partition key extractor expression per the CloudEvents Kafka transport binding specification.
   */
  partitionkeyextractor?: string;
  /**
   *
   */
  clientid?: string;
  /**
   *
   */
  acks?: string;
}

export interface NATSSettings {
  /**
   * The name of the NATS subject to publish to.
   */
  subject: string;
}

/**
 * A subscription manager manages a collection of subscriptions. The upper limit on how many
 * subscriptions are supported is implementation specific.
 *
 * To help explain the subscription resource, the following non-normative pseudo json shows its
 * basic structure:
 *
 */
export default interface Subscription {
  id: string;
  /**
   * Indicates the source to which the subscription is related. When present on a subscribe request,
   * all events generated due to this subscription MUST have a CloudEvents source property that
   * matches this value. If this property is not present on a subscribe request then there are no
   * constraints placed on the CloudEvents source property for the events generated.
   *
   * If present, MUST be a non-empty URI
   */
  source?: string;
  /**
   * Indicates which types of events the subscriber is interested in receiving. When present on a
   * subscribe request, all events generated due to this subscription MUST have a CloudEvents type
   * property that matches one of these values.
   *
   * If present, any value present MUST a non-empty string
   *
   * @example com.github.pull_request.opened
   * @example com.example.object.deleted
   */
  types?: string[];
  /**
   * A set of key/value pairs that modify the configuration of of the subscription related to the
   * event generation process. While this specification places no constraints on the data type of
   * the map values. When there is a Discovery Enpoint Service definition defined for the subscription
   * manager, then the key MUST be one of the subscriptionconfig keys specified in the Discovery
   * Endpoint Service definition. The value MUST conform to the data type specified by the value in
   * the subscriptionconfig entry for the key
   *
   * If present, any "key" used in the map MUST be a non-empty string
   */
  config?: { [key: string]: string };
  /**
   * Identifier of a delivery protocol. Because of WebSocket tunneling options for AMQP, MQTT and
   * other protocols, the URI scheme is not sufficient to identify the protocol. The protocols with
   * existing CloudEvents bindings are identified as AMQP, MQTT3, MQTT5, HTTP, KAFKA, and NATS.
   * An implementation MAY add support for further protocols.
   *
   * Value comparisons are case sensitive.
   */
  protocol: "HTTP" | "MQTT" | "WEBDA";
  /**
   * A set of settings specific to the selected delivery protocol provider. Options for these
   * settings are listed in the following subsection. An subscription manager MAY offer more options.
   * See the Protocol Settings section for future details.
   */
  protocolsettings?: HttpSettings | MQTTSettings | AMQPSettings | KafkaSettings | NATSSettings;
  /**
   * The address to which events MUST be sent. The format of the address MUST be valid for the
   * protocol specified in the protocol property, or one of the protocol's own transport bindings
   * (e.g. AMQP over WebSockets).
   *
   * @required
   */
  sink: string;
  /**
   * An array of filter expressions that evaluates to true or false. If any filter expression in the
   * array evaluates to false, the event MUST NOT be sent to the sink. If all the filter expressions
   * in the array evaluates to true, the event MUST be attempted to be delivered. Absence of a filter
   * or empty array implies a value of true.
   *
   * Each filter dialect MUST have a name that is unique within the scope of the subscription manager.
   * Each dialect will define the semantics and syntax of the filter expression language. See the
   * Filters section for more information.
   *
   * If a subscription manager does not support filters, or the filter dialect specified in a
   * subscription request, then it MUST generate an error and reject the subscription create or
   * update request.
   */
  filters: Filter[];
}

/**
 * Subscription Mixin to add default behavior to a subscription
 * @param clazz
 * @returns
 */
export function SubscriptionMixIn(clazz: any) {
  /**
   * Filter implementation
   */
  let resolvedFilters: FilterImplementation<Filter>;

  /**
   * Emitter
   */
  let emitter: EmitterFunction;
  return class extends clazz implements Subscription {
    id: string;
    source?: string;
    types?: string[];
    config?: { [key: string]: string };
    protocol: "HTTP" | "MQTT" | "WEBDA" = "HTTP";
    protocolsettings?: HttpSettings | MQTTSettings | AMQPSettings | KafkaSettings | NATSSettings;
    sink: string = "";
    filters: Filter[] = [];

    constructor() {
      super();
      this.id ??= randomUUID();
    }

    /**
     * Verify that an event match its filters
     * @param event
     * @returns
     */
    match(event: CloudEvent): boolean {
      // Need to filter first on types
      if (this.types && !this.types.includes(event.type)) {
        return false;
      }
      resolvedFilters ??= FiltersHelper.get({ all: this.filters });
      return resolvedFilters.match(event);
    }

    /**
     * Create the emitter for the subscription
     * @returns
     */
    createEmitter(): EmitterFunction {
      if (this.protocol === "HTTP") {
        return emitterFor(httpTransport(this.sink), this.protocolsettings as any);
      }
      throw new Error("Unsupported protocol");
    }

    /**
     * Emit a cloudevent
     * @param event
     */
    async emit(event: CloudEvent) {
      // Ensure the subscription match the event
      if (!this.match(event)) {
        return;
      }
      emitter ??= this.createEmitter();
      await emitter(event);
    }
  };
}

export { Subscription };
