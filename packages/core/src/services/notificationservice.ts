import { useService } from "../core/hooks";
import { AbstractService } from "../core/icore";
import type { Ident } from "../models/ident";
import type { User } from "../models/user";
import { ServiceParameters } from "../interfaces";
import { Service } from "./service";

/**
 * Define a service that can notify a user based on his info
 * It can use email or SMS or any other media
 */
export interface NotificationService extends AbstractService {
  /**
   * Check if this type of notification is available
   */
  hasNotification(notification: string): Promise<boolean>;
  /**
   * Check if the service can deliver notification to this user
   * @param user
   */
  handleNotificationFor(userOrIdent: User | Ident): Promise<boolean>;
  /**
   * Send the notification to the user
   * @param user
   * @param notification
   * @param replacements
   */
  sendNotification(user: User | Ident, notification: string, replacements: any): Promise<void>;
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
  default() {
    super.default();
    this.senders ??= [];
    this.multiple ??= false;
  }
}

/**
 * Allow an aggregation of Notification to send via multiple media
 * like SMS and Email
 *
 * @WebdaModda
 */
export default class MultiNotificationService<T extends MultiNotificationParameters = MultiNotificationParameters>
  extends Service<T>
  implements NotificationService
{
  senders: NotificationService[];

  /**
   * @override
   */
  resolve(): this {
    super.resolve();
    this.senders = this.parameters.senders.map(s => {
      const service = useService<NotificationService>(s);
      if (!service) {
        throw new Error(`Unknown service '${s}'`);
      }
      return service;
    });
    return this;
  }

  /**
   * @override
   */
  async sendNotification(user: User | Ident, notification: string, replacements: any): Promise<void> {
    const selectedSenders = (
      await Promise.all(
        this.senders.map(async s => {
          if ((await s.hasNotification(notification)) && (await s.handleNotificationFor(user))) {
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
  async handleNotificationFor(user: User | Ident): Promise<boolean> {
    return (await Promise.all(this.senders.map(s => s.handleNotificationFor(user)))).some(s => s);
  }

  /**
   * @override
   */
  async hasNotification(notification: string): Promise<boolean> {
    return (await Promise.all(this.senders.map(s => s.hasNotification(notification)))).some(s => s);
  }
}

export { MultiNotificationService };
