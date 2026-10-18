export type QueryOperation = "query" | "iterate" | "aggregate" | "deleteMany" | "updateMany";

export interface QueryExecutionInfo {
  operation: QueryOperation;
  /** Model identifier (useModelId) */
  model: string;
  /** Bound WebdaQL string (or JSON aggregation spec) */
  query: string;
  /** Wall-clock duration in ms */
  duration: number;
  /** Results returned (query / iterate page) or rows affected (bulk) */
  count?: number;
  /** True when a continuationToken was returned */
  paginated?: boolean;
  /** Set when the backend threw */
  error?: Error;
}

export interface QueryMonitorOptions {
  /** Called after every monitored operation, success or failure */
  onQuery?: (info: QueryExecutionInfo) => void;
}
