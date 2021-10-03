import { Service, ServiceParameters } from "../services/service";
import { CancelablePromise } from "../utils/waiter";

export default abstract class PubSubService<
  T = any,
  K extends ServiceParameters = ServiceParameters
> extends Service<K> {
  /**
   * Send an event to the queue
   * @param event
   */
  abstract sendMessage(event: T): Promise<void>;

  /**
   * Unserialize into class
   * @param data
   * @param proto
   * @returns
   */
  unserialize<L>(data: string, proto?: { new (): L }): L {
    if (proto) {
      return Object.assign(new proto(), JSON.parse(data));
    }
    return JSON.parse(data);
  }

  /**
   * Subscribe to a channel calling the callback with every Event received
   * @param callback
   * @param eventPrototype
   */
  abstract consume(
    callback: (event: T) => Promise<void>,
    eventPrototype?: { new (): T },
    onBind?: () => void
  ): CancelablePromise;
}

export { PubSubService };
