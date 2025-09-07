
import { InstanceStorage, runWithInstanceStorage, useInstanceStorage } from "../core/instancestorage";
import { CallbackOptionallyAsync } from "@webda/test";
import { serialize, deserialize } from "@webda/serialize";
import { WebdaTest } from "./core";

export class WebdaAsyncStorageTest extends WebdaTest {
  pretestState: string;

  wrap(
    type:  "beforeAll" | "test" | "afterAll",
    callback: CallbackOptionallyAsync
  ) {
    if (type === "beforeAll") {
        console.log(`Before All - before callback`);
      const state = {};
      return <Promise<void>>runWithInstanceStorage(state, async () => {
        console.log("Run with instance storage");
        await callback();
        console.log(`Before All - after callback`);
        this.pretestState = serialize(useInstanceStorage());
      });
    } else if (type === "afterAll") {
      console.log(`Deserialize '${this.pretestState}'`);
      return <Promise<void>>runWithInstanceStorage(
        deserialize(this.pretestState),
        callback
      );
    } else if (type === "test") {
      return <Promise<void>>runWithInstanceStorage(deserialize(this.pretestState), callback);
    }
  };
}