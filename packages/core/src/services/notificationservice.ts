import { User } from "../models/user";
import { Service, ServiceParameters } from "./service";

/**
 * Define a service that can notify a user based on his info
 * It can use email or SMS or any other media
 */
export interface NotificationService {
  /**
   * Check if this type of notification is available
   */
  hasTemplate(notification: string): Promise<boolean>;
  /**
   * Check if the service can deliver notification to this user
   * @param user
   */
  handleUser(user: User): Promise<boolean>;
  /**
   * Send the notification to the user
   * @param user
   * @param notification
   * @param replacements
   */
  sendNotification(user: User, notification: string, replacements: any): Promise<void>;
}

/**
 * Parameters for multi notification service
 */
export class MultiNotificationParameters extends ServiceParameters {
  /**
   * Notification service that will send
   * The order of the array is important if multiple is false
   * When multiple is `false` the first available NotificationService will
   * be used, otherwise every available NotificationService will be used
   */
  senders: string[];
  /**
   * Define if it sends one or several notification per user
   * @default false
   */
  multiple?: boolean;

  /**
   * @override
   */
  constructor(params: any) {
    super(params);
    this.senders ??= [];
  }
}

/**
 * Allow an aggregation of Notification to send via multiple media
 * like SMS and Email
 */
export default class MultiNotificationService<
  T extends MultiNotificationParameters = MultiNotificationParameters
> extends Service<T> {
  senders: NotificationService[];

  /**
   * @override
   */
  loadParameters(params: any): MultiNotificationParameters {
    return new MultiNotificationParameters(params);
  }

  /**
   * @override
   */
  resolve() {
    this.senders = this.parameters.senders.map(s => {
      let service = <NotificationService>(<unknown>this.getService(s));
      if (!service) {
        throw new Error(`Unknown service '${s}'`);
      }
      return service;
    });
  }

  /**
   * @override
   */
  async sendNotification(user: User, notification: string, replacements: any): Promise<void> {
    const selectedSenders = (
      await Promise.all(
        this.senders.map(async s => {
          if ((await s.hasTemplate(notification)) && (await s.handleUser(user))) {
            return s;
          }
        })
      )
    ).filter(s => s !== undefined);
    if (!selectedSenders.length) {
      return;
    }
    if (!this.parameters.multiple) {
      return selectedSenders.shift().sendNotification(user, notification, replacements);
    }
    await Promise.all(selectedSenders.map(s => s.sendNotification(user, notification, replacements)));
  }

  /**
   * @override
   */
  async handleUser(user: User): Promise<boolean> {
    return (await Promise.all(this.senders.map(s => s.handleUser(user)))).some(s => s);
  }

  /**
   * @override
   */
  async hasTemplate(notification: string): Promise<boolean> {
    return (await Promise.all(this.senders.map(s => s.hasTemplate(notification)))).some(s => s);
  }
}

export { MultiNotificationService };
