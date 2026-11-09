import { useWorkerOutput, WorkerInputType } from "./core";

class Test {
  async test() {
    const duration = 10;
    const output = useWorkerOutput();
    output.log("INFO", "Start test");
    const test = await output.requestInput("Input String", WorkerInputType.STRING);
    await output.requestInput("Do you confirm?", WorkerInputType.CONFIRMATION);
    await output.requestInput("List selection?", WorkerInputType.LIST);
    await output.requestInput("Enter password:", WorkerInputType.PASSWORD);
    // Infinite progress
    output.startProgress("test", -1);
    await new Promise(resolve => setTimeout(resolve, duration));
    output.stopActivity("success");
  }
}
