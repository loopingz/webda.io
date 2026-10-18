import { WebdaError } from "@webda/core";

/** RFC 6749 error, rendered as `{ error, error_description }` */
export class OAuthError extends WebdaError.HttpError {
  /**
   * @param error - OAuth error code
   * @param description - human readable description
   * @param status - HTTP status
   */
  constructor(
    public error: string,
    description: string,
    status: number = 400
  ) {
    super(description, status);
    this.details = { error, error_description: description };
  }

  /**
   * @returns the RFC 6749 error body
   */
  toJSON(): { error: string; error_description: string } {
    return { error: this.error, error_description: this.message };
  }
}
