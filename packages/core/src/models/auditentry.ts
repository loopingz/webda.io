import { UuidModel } from "@webda/models";

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
