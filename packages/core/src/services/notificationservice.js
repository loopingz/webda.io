import { useDynamicService } from "../core/hooks.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { Service } from "./service.js";
/**
 * Parameters for multi notification service
 */
export class MultiNotificationParameters extends ServiceParameters {
    /**
     * @override
     */
    load(params = {}) {
        super.load(params);
        this.senders ?? (this.senders = []);
        this.multiple ?? (this.multiple = false);
        return this;
    }
}
/**
 * Allow an aggregation of Notification to send via multiple media
 * like SMS and Email
 *
 * @WebdaModda
 */
export default class MultiNotificationService extends Service {
    /**
     * @override
     */
    resolve() {
        super.resolve();
        console.log("resolve", this.parameters.senders);
        this.senders = this.parameters.senders.map(s => {
            const service = useDynamicService(s);
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
    async sendNotification(user, notification, replacements) {
        const selectedSenders = (await Promise.all(this.senders.map(async (s) => {
            if ((await s.hasNotification(notification)) && (await s.handleNotificationFor(user))) {
                return s;
            }
        }))).filter(s => s !== undefined);
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
    async handleNotificationFor(user) {
        return (await Promise.all(this.senders.map(s => s.handleNotificationFor(user)))).some(s => s);
    }
    /**
     * @override
     */
    async hasNotification(notification) {
        return (await Promise.all(this.senders.map(s => s.hasNotification(notification)))).some(s => s);
    }
}
export { MultiNotificationService };
//# sourceMappingURL=notificationservice.js.map