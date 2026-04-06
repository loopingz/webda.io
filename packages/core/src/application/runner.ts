import { CancelablePromise } from "@webda/utils";
import { Core } from "../core/core.js";
import { runWithInstanceStorage, useInstanceStorage } from "../core/instancestorage.js";
import { Application } from "./application.js";

/**
 * Run the application by creating a Core instance, initializing it, and handling SIGINT.
 * @param application - the application instance
 * @returns the result
 */
export async function runApplication(application: Application): Promise<void> {
  return runWithInstanceStorage({}, async () => {
    useInstanceStorage().application = application;
    await application.load();
    const core = new Core(application);
    process.on("SIGINT", async () => {
      console.log("Received SIGINT. Cancelling all interuptables.");
      await Promise.all([...CancelablePromise.promises].map(p => p.cancel()));
      await core.stop();
      process.exit(0);
    });
    await core.init();
  });
}

// Register the runner on Application to break the circular dependency
Application._runner = runApplication;
