import { InstanceStorage, runWithInstanceStorage, useInstanceStorage } from "../core/instancestorage.js";
import { CallbackOptionallyAsync } from "@webda/test";
import { WebdaTest } from "./core.js";

export class WebdaAsyncStorageTest extends WebdaTest {
  pretestState: string;
  instanceStorage: InstanceStorage = {} as any;

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
