import {
  ServiceBusAdministrationClient,
  ServiceBusClient,
  ServiceBusReceivedMessage,
  ServiceBusReceiver,
  ServiceBusSender
} from "@azure/service-bus";
import { MessageReceipt, PubSubService, Queue, QueueParameters, SecretString, WebdaError } from "@webda/core";
import { CancelablePromise, JSONUtils } from "@webda/utils";
import { randomUUID } from "node:crypto";
import {
  AzureParameters,
  AzureServiceParameters,
  getAzureCredential,
  loadAzureParameters
} from "./azure-parameters.js";
import { AzureContributor, AzureDeployerInfo, AzureResourceContribution } from "./contributors.js";

interface ServiceBusSettings extends AzureServiceParameters {
  namespace: string;
  connectionString?: string | SecretString;
  createIfNotExists?: boolean;
}

/**
 * Construct SDK clients without performing network I/O.
 * @param params - Raw configuration parameters
 * @returns The clients result
 */
function createClients(params: ServiceBusSettings) {
  if (params.connectionString !== undefined) {
    const connection = SecretString.from(params.connectionString, "connectionString");
    return { client: new ServiceBusClient(connection), admin: new ServiceBusAdministrationClient(connection) };
  }
  const credential = getAzureCredential(params);
  return {
    client: new ServiceBusClient(params.namespace, credential),
    admin: new ServiceBusAdministrationClient(params.namespace, credential)
  };
}

/**
 * Describe an existing namespace's messaging entities and managed identity permissions.
 * @param params - Raw configuration parameters
 * @param deployer - Deployment scope and identity helpers
 * @param entity - Queue or topic name
 * @param topic - Whether the entity is a topic
 * @param subscription - Configured subscription name, if any
 * @returns The contribute result
 */
function contribute(
  params: ServiceBusSettings,
  deployer: AzureDeployerInfo,
  entity: string,
  topic: boolean,
  subscription?: string
): AzureResourceContribution {
  const namespace = params.namespace.split(".")[0];
  const entityType = topic ? "topics" : "queues";
  const name = `${namespace}/${entity}`;
  const scope = `/subscriptions/${deployer.resources.subscriptionId}/resourceGroups/${deployer.resources.resourceGroup}/providers/Microsoft.ServiceBus/namespaces/${name.replace("/", `/${entityType}/`)}`;
  const resources: Record<string, unknown>[] = [
    { type: `Microsoft.ServiceBus/namespaces/${entityType}`, apiVersion: "2024-01-01", name, properties: {} }
  ];
  if (topic && subscription)
    resources.push({
      type: "Microsoft.ServiceBus/namespaces/topics/subscriptions",
      apiVersion: "2024-01-01",
      name: `${name}/${subscription}`,
      dependsOn: [scope],
      properties: {}
    });
  const roles = ["69a216fc-b8fb-44d8-bc22-1f3c2cd27a39", "4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0"];
  // Temporary subscriptions need management rights on the topic, in addition to data-plane access.
  if (topic && !subscription) roles.push("090c5cfd-751d-490a-894a-3ce6f1109419");
  return {
    resources,
    roleAssignments: roles.map(role => ({
      scope,
      roleDefinitionId: `/subscriptions/${deployer.resources.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${role}`
    }))
  };
}

/** Service Bus work queue settings. */
export class ServiceBusQueueParameters extends QueueParameters implements ServiceBusSettings {
  namespace!: string;
  connectionString?: string | SecretString;
  createIfNotExists = false;
  queue!: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string | SecretString;
  subscriptionId?: string;
  endpoint?: string;
  maxMessages = 10;
  maxWaitTimeInMs = 1000;
  maxPendingMessages = 1000;

  /**
   * Perform load.
   * @override
   */
  load(params: any = {}): this {
    super.load(params);
    return loadAzureParameters(this);
  }
}

/** Service Bus peek-lock queue. Receipts retain their exact SDK message until completion or expiry.
 * @WebdaModda
 */
export class ServiceBusQueue<T = any> extends Queue<T, ServiceBusQueueParameters> implements AzureContributor {
  static Parameters = ServiceBusQueueParameters;
  protected client!: ServiceBusClient;
  protected admin!: ServiceBusAdministrationClient;
  protected sender!: ServiceBusSender;
  protected receiver!: ServiceBusReceiver;
  protected pending = new Map<string, ServiceBusReceivedMessage>();

  /**
   * Perform init.
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    const p = this.parameters;
    if (
      !Number.isInteger(p.maxMessages) ||
      p.maxMessages < 1 ||
      !Number.isInteger(p.maxPendingMessages) ||
      p.maxPendingMessages < p.maxMessages
    ) {
      throw new WebdaError.BadRequest("Service Bus requires positive message limits");
    }
    ({ client: this.client, admin: this.admin } = createClients(p));
    if (p.createIfNotExists && !(await this.admin.queueExists(p.queue))) await this.admin.createQueue(p.queue);
    this.sender = this.client.createSender(p.queue);
    this.receiver = this.client.createReceiver(p.queue, { receiveMode: "peekLock" });
    return this;
  }

  /**
   * Perform send message.
   * @override
   */
  async sendMessage(event: T): Promise<void> {
    await this.sender.sendMessages({ body: JSONUtils.stringify(event), contentType: "application/json" });
    this.metrics.messages_sent.inc();
  }

  /**
   * Perform receive message.
   * @override
   */
  async receiveMessage<L>(proto?: new () => L): Promise<MessageReceipt<L>[]> {
    for (const [handle, message] of this.pending) {
      if (!message.lockedUntilUtc || message.lockedUntilUtc.getTime() <= Date.now()) this.pending.delete(handle);
    }
    const count = Math.min(this.parameters.maxMessages, this.parameters.maxPendingMessages - this.pending.size);
    if (!count) return [];
    const messages = await this.receiver.receiveMessages(count, { maxWaitTimeInMs: this.parameters.maxWaitTimeInMs });
    const receipts: MessageReceipt<L>[] = [];
    for (const message of messages) {
      try {
        const value = this.unserialize<L>(
          typeof message.body === "string" ? message.body : JSONUtils.stringify(message.body),
          proto
        );
        const handle = randomUUID();
        this.pending.set(handle, message);
        receipts.push({ Message: value, ReceiptHandle: handle });
      } catch {
        this.metrics.errors.inc();
        await this.receiver.abandonMessage(message);
      }
    }
    return receipts;
  }

  /**
   * Perform delete message.
   * @override
   */
  async deleteMessage(handle: string): Promise<void> {
    const message = this.pending.get(handle);
    if (!message) throw new WebdaError.NotFound("Service Bus receipt is unknown or expired");
    await this.receiver.completeMessage(message);
    this.pending.delete(handle);
  }

  /**
   * Perform size.
   * @override
   */
  async size(): Promise<number> {
    return (await this.admin.getQueueRuntimeProperties(this.parameters.queue)).activeMessageCount;
  }

  /**
   * Perform stop.
   * @override
   */
  async stop(): Promise<void> {
    try {
      await this.receiver?.close();
    } finally {
      this.pending.clear();
      try {
        await this.sender?.close();
      } finally {
        await this.client?.close();
      }
    }
    await super.stop();
  }

  /**
   * Describe the Azure resources and identity permissions required by this service.
   * @param deployer - Deployment scope and identity helpers
   * @returns The azure resources result
   */
  getAzureResources(deployer: AzureDeployerInfo): AzureResourceContribution {
    return contribute(this.parameters, deployer, this.parameters.queue, false);
  }
}

/** Service Bus pub/sub settings. Omit subscription to create one temporary subscription per consumer. */
export class ServiceBusPubSubParameters extends AzureParameters implements ServiceBusSettings {
  namespace!: string;
  connectionString?: string | SecretString;
  createIfNotExists = false;
  topic!: string;
  subscription?: string;
}

/** Service Bus topic with explicit completion after successful processing.
 * @WebdaModda
 */
export class ServiceBusPubSub<T = any>
  extends PubSubService<T, ServiceBusPubSubParameters>
  implements AzureContributor
{
  static Parameters = ServiceBusPubSubParameters;
  protected client!: ServiceBusClient;
  protected admin!: ServiceBusAdministrationClient;
  protected sender!: ServiceBusSender;
  protected consumers = new Set<CancelablePromise>();

  /**
   * Perform init.
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    ({ client: this.client, admin: this.admin } = createClients(this.parameters));
    if (this.parameters.createIfNotExists && !(await this.admin.topicExists(this.parameters.topic)))
      await this.admin.createTopic(this.parameters.topic);
    this.sender = this.client.createSender(this.parameters.topic);
    return this;
  }

  /**
   * Perform send message.
   * @override
   */
  async sendMessage(event: T): Promise<void> {
    await this.sender.sendMessages({ body: JSONUtils.stringify(event), contentType: "application/json" });
    this.metrics.messages_sent.inc();
  }

  /**
   * Perform size.
   * @override
   */
  async size(): Promise<number> {
    return this.parameters.subscription
      ? (await this.admin.getSubscriptionRuntimeProperties(this.parameters.topic, this.parameters.subscription))
          .activeMessageCount
      : 0;
  }

  /**
   * Perform consume.
   * @override
   */
  consume(callback: (event: T) => Promise<void>, proto?: new () => T, onBind?: () => void): CancelablePromise {
    const topic = this.parameters.topic;
    const temporary = !this.parameters.subscription;
    const subscription = this.parameters.subscription ?? `webda-${randomUUID()}`;
    let receiver: ServiceBusReceiver | undefined;
    let created = false;
    let closing: Promise<void> | undefined;
    const cleanup = () =>
      (closing ??= (async () => {
        try {
          await receiver?.close();
        } finally {
          if (created) await this.admin.deleteSubscription(topic, subscription);
        }
      })());
    const binding = (async () => {
      if (
        temporary ||
        (this.parameters.createIfNotExists && !(await this.admin.subscriptionExists(topic, subscription)))
      ) {
        await this.admin.createSubscription(topic, subscription, temporary ? { autoDeleteOnIdle: "PT5M" } : {});
        created = temporary;
      }
      receiver = this.client.createReceiver(topic, subscription, { receiveMode: "peekLock" });
      receiver.subscribe(
        {
          processMessage: async message => {
            this.metrics.messages_received.inc();
            const end = this.metrics.processing_duration.startTimer();
            try {
              await callback(
                this.unserialize(
                  typeof message.body === "string" ? message.body : JSONUtils.stringify(message.body),
                  proto
                )
              );
              await receiver!.completeMessage(message);
            } catch {
              this.metrics.errors.inc();
              await receiver!.abandonMessage(message);
            } finally {
              end();
            }
          },
          processError: async () => {
            this.metrics.errors.inc();
          }
        },
        { autoCompleteMessages: false }
      );
      onBind?.();
    })();
    const consumer = new CancelablePromise(
      (_resolve, reject) => {
        void binding.catch(async error => {
          await cleanup().catch(() => {});
          reject(error);
        });
      },
      async () => {
        await binding.catch(() => {});
        await cleanup();
      }
    );
    this.consumers.add(consumer);
    // The consumer remains pending until cancellation or failure; observe its rejection during shutdown.
    void consumer.catch(() => this.consumers.delete(consumer));
    return consumer;
  }

  /**
   * Perform stop.
   * @override
   */
  async stop(): Promise<void> {
    try {
      await Promise.all([...this.consumers].map(consumer => consumer.cancel()));
    } finally {
      try {
        await this.sender?.close();
      } finally {
        await this.client?.close();
      }
    }
    await super.stop();
  }

  /**
   * Describe the Azure resources and identity permissions required by this service.
   * @param deployer - Deployment scope and identity helpers
   * @returns The azure resources result
   */
  getAzureResources(deployer: AzureDeployerInfo): AzureResourceContribution {
    return contribute(this.parameters, deployer, this.parameters.topic, true, this.parameters.subscription);
  }
}
