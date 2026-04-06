import { InstanceStorage, runWithInstanceStorage, useInstanceStorage } from "../core/instancestorage.js";
import { CallbackOptionallyAsync } from "@webda/test";
import { WebdaTest } from "./core.js";

/** Test base that runs each test phase within a shared AsyncLocalStorage context */
export class WebdaAsyncStorageTest extends WebdaTest {
  pretestState: string;
  instanceStorage: InstanceStorage = {} as any;

  /**
   * Wrap test callbacks inside a shared InstanceStorage context
   * @param type - the type to look up
   * @param callback - the callback function
   * @returns the result
   */
  wrap(type: "beforeAll" | "test" | "afterAll", callback: CallbackOptionallyAsync) {
    // @ts-ignore
    global.it ??= () => {};
    if (type === "beforeAll") {
      return <Promise<void>>runWithInstanceStorage(this.instanceStorage, async () => {
        await callback();
        this.instanceStorage = useInstanceStorage();
      });
    } else if (type === "afterAll") {
      return <Promise<void>>runWithInstanceStorage(this.instanceStorage, callback);
    } else if (type === "test") {
      return <Promise<void>>runWithInstanceStorage(this.instanceStorage, async () => {
        await callback();
      });
    }
  }
}
