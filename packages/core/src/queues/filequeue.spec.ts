import { suite, test } from "@testdeck/mocha";
import { FileQueue } from "./filequeue";
import { QueueTest } from "./queue.spec";

@suite
class FileQueueTest extends QueueTest {
  @test
  async basic() {
    let queue: FileQueue = <FileQueue>this.getService("FileQueue");
    await queue.__clean();
    await this.simple(queue);
  }
}
