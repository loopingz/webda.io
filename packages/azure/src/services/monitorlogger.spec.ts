import { suite, test } from "@webda/test";
import { SecretString, useDynamicService } from "@webda/core";
import { useWorkerOutput } from "@webda/workout";
import { expect, vi } from "vitest";
import { addAzureModda, AzureTest } from "../../test/fixture.js";
import { AzureMonitorLogger, AzureMonitorLoggerParameters } from "./monitorlogger.service.js";

const sdk = vi.hoisted(() => ({ upload: vi.fn(async () => {}) }));
vi.mock("@azure/monitor-ingestion", () => ({
  LogsIngestionClient: class {
    upload = sdk.upload;
  }
}));

@suite
class MonitorTest extends AzureTest {
  async tweakApp(app) {
    await super.tweakApp(app);
    addAzureModda(app, "Test/Monitor", AzureMonitorLogger, AzureMonitorLoggerParameters);
    app.getCurrentConfiguration().services.Monitor = {
      type: "Test/Monitor",
      endpoint: "https://test.ingest.monitor.azure.com",
      ruleId: "rule",
      streamName: "Custom-Webda",
      batchSize: 3,
      maxBufferedLogs: 6,
      flushInterval: 60000
    };
  }

  @test async batchesFiltersAndMasks() {
    const logger = useDynamicService<AzureMonitorLogger>("Monitor");
    await logger.sendLogs();
    sdk.upload.mockClear();
    useWorkerOutput().emit("message", { type: "progress" });
    useWorkerOutput().emit("message", { type: "log", log: { level: "DEBUG", args: ["filtered"] } });
    useWorkerOutput().emit("message", {
      type: "log",
      log: { level: "WARN", args: ["one", new SecretString("hidden", "test")] }
    });
    logger._log("INFO", "two");
    expect(sdk.upload).not.toHaveBeenCalled();
    logger._log("ERROR", "three");
    await logger.sendLogs();
    expect(sdk.upload).toHaveBeenCalledTimes(1);
    const records = sdk.upload.mock.calls[0][2];
    expect(records).toHaveLength(3);
    expect(JSON.stringify(records)).not.toContain("hidden");
    expect(JSON.stringify(records)).not.toContain("filtered");
    expect(records[0]).toMatchObject({ Level: "WARN", TimeGenerated: expect.any(String) });
  }

  @test async retriesWithoutRecursiveLoggingAndBoundsBuffer() {
    const logger = useDynamicService<AzureMonitorLogger>("Monitor");
    sdk.upload.mockRejectedValueOnce(new Error("offline"));
    logger._log("INFO", "retry");
    await logger.sendLogs();
    expect(logger.lastDeliveryFailed).toBe(true);
    await logger.sendLogs();
    expect(logger.lastDeliveryFailed).toBe(false);
    let release!: () => void;
    sdk.upload.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        })
    );
    logger._log("INFO", "in flight");
    const sending = logger.sendLogs();
    expect(logger.sendLogs()).toBe(sending);
    for (let index = 0; index < 8; index++) logger._log("WARN", index);
    expect(logger.droppedLogs).toBe(2);
    release();
    await sending;
    sdk.upload.mockClear();
    logger._log("INFO", "stop flush");
    await logger.stop();
    expect(sdk.upload.mock.calls[0][2]).toEqual([expect.objectContaining({ Message: "stop flush" })]);
    sdk.upload.mockClear();
    useWorkerOutput().emit("message", { type: "log", log: { level: "INFO", args: ["removed"] } });
    await logger.sendLogs();
    expect(sdk.upload).not.toHaveBeenCalled();
  }
}
