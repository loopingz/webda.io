import { useLog, useWorkerOutput, WorkerInputType, WorkerOutput } from "../src/core";
import { Fork } from "../src/fork";
import { InteractiveConsoleLogger } from "../src/loggers/interactiveconsole";


const consoleLogger = new InteractiveConsoleLogger(useWorkerOutput());
//const term = new Terminal(useWorkerOutput());

//const childOutput = new WorkerOutput();
//const memory = new MemoryLogger(childOutput);
const parent = Fork(async () => {
  useLog("INFO", "Hello from the fork");
  //await new Promise(resolve => setTimeout(resolve, 5000));
  useWorkerOutput().startActivity("Test");
  //const input = await useWorkerOutput().requestInput("What is your name", WorkerInputType.STRING, [/.*/], true, 10000);
  let int = setInterval(() => {
    useLog("INFO", "Doing something");
  }, 500);
  await new Promise(resolve => setTimeout(resolve, 5000));
  clearInterval(int);
  useWorkerOutput().stopActivity("success");
  useWorkerOutput().startProgress("Test", 100, "Activity");
  //const input = await useWorkerOutput().requestInput("What is your name", WorkerInputType.STRING, [/.*/], true, 10000);
  let i = 0;
  int = setInterval(() => {
    if (i++ % 10 === 5) {
      useLog("INFO", "Doing something else");
    }
    try {
      useWorkerOutput().incrementProgress(1);
    } catch (err) {
      clearInterval(int);
    }
  }, 50);
  await new Promise(resolve => setTimeout(resolve, 6000));
  //useLog("INFO", "You said", input);
  useLog("INFO", "Good bye from the fork");
}, () => {
  useLog("INFO", "Parent post fork");
});
//, childOutput);
parent
  .then(() => {
    useLog("INFO", "Fork is done", process.send === undefined ? "" : "in child process");
  })
  .catch(() => {
    useLog("ERROR", "Fork failed");
  });

