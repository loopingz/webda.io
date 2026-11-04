import { LogsIngestionClient } from "@azure/monitor-ingestion";
import { Service, useCoreEvents, WebdaError } from "@webda/core";
import { LogFilter, useWorkerOutput, WorkerLogLevel, WorkerMessage } from "@webda/workout";
import { format } from "node:util";
import { AzureParameters, getAzureCredential } from "./azure-parameters.js";

/** Azure Monitor Logs Ingestion settings. */
export class AzureMonitorLoggerParameters extends AzureParameters {
  endpoint!: string;
  ruleId!: string;
  streamName!: string;
  logLevel: WorkerLogLevel = "INFO";
  batchSize = 100;
  flushInterval = 5000;
  maxBufferedLogs = 10000;
}

/** Columns declared in the Data Collection Rule's stream. */
export interface AzureLogRecord extends Record<string, unknown> {
  TimeGenerated: string;
  Level: WorkerLogLevel;
  Message: string;
}

/** Forward Webda logs to a custom Azure Monitor table.
 * @WebdaModda
 */
export class AzureMonitorLogger extends Service<AzureMonitorLoggerParameters> {
  static Parameters = AzureMonitorLoggerParameters;
  protected client!: LogsIngestionClient;
  protected buffer: AzureLogRecord[] = [];
  protected sending?: Promise<void>;
  protected timer?: ReturnType<typeof setInterval>;
  protected messageListener?: (message: WorkerMessage) => void;
  protected resultListenerOff?: () => void;
  /** Number of records dropped because the bounded buffer was full. */
  droppedLogs = 0;
  /** Last delivery error, available to health checks without recursively logging it. */
  lastDeliveryFailed = false;

  /**
   * Perform init.
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    const p = this.parameters;
    if (
      !p.endpoint ||
      !p.ruleId ||
      !p.streamName ||
      !Number.isInteger(p.batchSize) ||
      p.batchSize < 1 ||
      !Number.isInteger(p.maxBufferedLogs) ||
      p.maxBufferedLogs < p.batchSize ||
      p.flushInterval < 1
    ) {
      throw new WebdaError.BadRequest(
        "Azure Monitor requires endpoint, ruleId, streamName and positive buffer settings"
      );
    }
    this.removeListeners();
    this.client = new LogsIngestionClient(p.endpoint, getAzureCredential(p));
    this.messageListener = message => {
      if (message.type === "log" && message.log && LogFilter(message.log.level, p.logLevel)) {
        this._log(message.log.level, ...message.log.args);
      }
    };
    useWorkerOutput().on("message", this.messageListener);
    this.resultListenerOff = useCoreEvents("Webda.Result", () => this.sendLogs());
    this.timer = setInterval(() => {
      void this.sendLogs();
    }, p.flushInterval);
    this.timer.unref();
    return this;
  }

  /**
   * Buffer one record. SecretString values retain their masked representation.
   * @param level - Worker log level
   * @param args - Log arguments
   */
  _log(level: WorkerLogLevel, ...args: unknown[]): void {
    if (this.buffer.length >= this.parameters.maxBufferedLogs) {
      this.droppedLogs++;
      return;
    }
    this.buffer.push({ TimeGenerated: new Date().toISOString(), Level: level, Message: format(...args) });
    if (this.buffer.length >= this.parameters.batchSize) void this.sendLogs();
  }

  /**
   * Serialize flushes; failed records stay at the front for the next scheduled retry.
   * @returns Completion of the current flush attempt
   */
  sendLogs(): Promise<void> {
    if (this.sending) return this.sending;
    this.sending = this.flush().finally(() => {
      this.sending = undefined;
    });
    return this.sending;
  }

  /**
   * Deliver buffered records in bounded batches.
   */
  protected async flush(): Promise<void> {
    while (this.buffer.length) {
      const records = this.buffer.splice(0, this.parameters.batchSize);
      try {
        await this.client.upload(this.parameters.ruleId, this.parameters.streamName, records);
        this.lastDeliveryFailed = false;
      } catch {
        this.lastDeliveryFailed = true;
        this.buffer.unshift(...records);
        const overflow = Math.max(0, this.buffer.length - this.parameters.maxBufferedLogs);
        this.buffer.splice(this.parameters.maxBufferedLogs, overflow);
        this.droppedLogs += overflow;
        return;
      }
    }
  }

  /**
   * Detach log forwarding and stop scheduled flushing.
   */
  protected removeListeners(): void {
    if (this.messageListener) useWorkerOutput().off("message", this.messageListener);
    this.messageListener = undefined;
    this.resultListenerOff?.();
    this.resultListenerOff = undefined;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * Perform stop.
   * @override
   */
  async stop(): Promise<void> {
    this.removeListeners();
    await this.sendLogs();
    await super.stop();
    if (this.buffer.length) throw new WebdaError.ServiceUnavailable("Unable to flush remaining Azure Monitor logs");
  }
}
