import { ServiceName } from "../core/hooks.js";
import { AbstractService } from "../core/icore.js";
import type { Ident } from "../models/ident.js";
import type { User } from "../models/user.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { Service } from "./service.js";
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
export declare class MultiNotificationParameters extends ServiceParameters {
    /**
     * Notification service that will send
     * The order of the array is important if multiple is false
     * When multiple is `false` the first available NotificationService will
     * be used, otherwise every available NotificationService will be used
     */
    senders: ServiceName[];
    /**
     * Define if it sends one or several notification per user
     * @default false
     */
    multiple?: boolean;
    /**
     * @override
     */
    load(params?: any): this;
}
/**
 * Allow an aggregation of Notification to send via multiple media
 * like SMS and Email
 *
 * @WebdaModda
 */
export default class MultiNotificationService<T extends MultiNotificationParameters = MultiNotificationParameters> extends Service<T> implements NotificationService {
    senders: NotificationService[];
    /**
     * @override
     */
    resolve(): this;
    /**
     * @override
     */
    sendNotification(user: User | Ident, notification: string, replacements: any): Promise<void>;
    /**
     * @override
     */
    handleNotificationFor(user: User | Ident): Promise<boolean>;
    /**
     * @override
     */
    hasNotification(notification: string): Promise<boolean>;
}
export { MultiNotificationService };
//# sourceMappingURL=notificationservice.d.ts.map