class AuditEntry {
  actor: string | "SYSTEM";
  timestamp: number;
  action: string;
  status: "SUCCESS" | "ERROR";
  description: string;
  context: {
    ip?: string;
    userAgent?: string;
    [key: string]: any;
  };
}
