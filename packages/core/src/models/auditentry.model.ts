import { UuidModel } from "@webda/models";

/** Represents a single audit log entry with actor, operation, and result metadata */
export class AuditEntry extends UuidModel {
  actor: string | "SYSTEM";
  timestamp: number;
  operation: string;
  status: "SUCCESS" | "ERROR";
  description: string;
  context: {
    ip?: string;
    userAgent?: string;
    [key: string]: any;
  };
}
