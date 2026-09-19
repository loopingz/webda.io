import { Service, ServiceParameters } from "./runtime.js";

/** Parameters for the mailer. */
export class MailerParameters extends ServiceParameters {
  endpoint: string = "";
  retries: number = 3;
}

/** Service that should receive a generated loadParameters(). */
export class Mailer extends Service<MailerParameters> {
  send(): string {
    return this.parameters.endpoint;
  }
}

/** Service that already declares loadParameters and must not be touched. */
export class ManualMailer extends Service<MailerParameters> {
  protected loadParameters(data: any): MailerParameters {
    return new MailerParameters().load({ ...data, retries: 99 });
  }
}
