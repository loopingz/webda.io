import { useService } from "@webda/core";
import { AuthTest } from "./authtest.js";
import type { Authentication } from "../authentication.service.js";
import type { EmailPasswordProvider } from "../email/emailpassword.service.js";

/**
 * Base class for email/password provider specs, using the full test/config.json
 */
export abstract class EmailTest extends AuthTest {
  auth: Authentication;
  email: EmailPasswordProvider;

  /** @override */
  async beforeEach() {
    await super.beforeEach();
    this.auth = useService("Authentication" as any);
    this.email = useService("emailAuth" as any);
    const params = this.email.getParameters();
    params.verification = "after";
    params.throttle = { resendDelay: 14400000, failedBeforeDelay: 3, lockout: 900000 };
    params.password = { policy: ".{8,}" };
    this.email.resolve();
  }

  /**
   * @returns the url of the last sent email
   */
  lastMailUrl(): string {
    return this.mailer.sent[this.mailer.sent.length - 1].replacements.url;
  }

  /**
   * @param url - an emailed link
   * @returns its token query parameter
   */
  tokenOf(url: string): string {
    return new URL(url, "http://localhost").searchParams.get("token");
  }
}
