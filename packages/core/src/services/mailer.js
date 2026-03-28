import Email from "email-templates";
import * as fs from "fs";
import * as nodemailer from "nodemailer";
import * as path from "path";
import { Service } from "./service.js";
import { Counter } from "../metrics/metrics.js";
import { ServiceParameters } from "../services/serviceparameters.js";
/**
 * Parameters for the Mailer service configuration
 *
 * Configures the email transport, templates directory and template engine
 */
export class MailerParameters extends ServiceParameters {
    /**
     * Load and apply defaults to the mailer parameters
     *
     * Sets default templates directory to "./templates/", engine to "mustache",
     * and configures juice resource options for CSS inlining
     *
     * @param params - Raw parameters to load
     * @returns this instance with defaults applied
     */
    load(params = {}) {
        var _a, _b, _c;
        super.load(params);
        this.templates ?? (this.templates = "./templates");
        if (!this.templates.endsWith("/")) {
            this.templates += "/";
        }
        this.templatesEngine ?? (this.templatesEngine = "mustache");
        this.emailTemplateOptions ?? (this.emailTemplateOptions = {});
        (_a = this.emailTemplateOptions).juiceResources ?? (_a.juiceResources = {});
        (_b = this.emailTemplateOptions.juiceResources).webResources ?? (_b.webResources = {});
        (_c = this.emailTemplateOptions.juiceResources.webResources).relativeTo ?? (_c.relativeTo = path.resolve(this.templates));
        return this;
    }
}
/**
 * Abstract base class for mailer implementations
 *
 * Provides metrics tracking (sent/errors counters) and notification handling.
 * Subclasses must implement {@link send} and {@link hasNotification}.
 *
 * @typeParam T - Service parameters type
 */
export class AbstractMailer extends Service {
    /**
     * @override
     */
    initMetrics() {
        var _a;
        super.initMetrics();
        this.metrics.sent = this.getMetric(Counter, {
            name: "mailer_sent",
            help: "Number of emails sent"
        });
        (_a = this.metrics).errors ?? (_a.errors = this.getMetric(Counter, {
            name: "mailer_errors",
            help: "Number of emails in error"
        }));
    }
    /**
     * Check if notifications can be delivered to a user via email
     *
     * @param user - User or Ident to check for email availability
     * @returns true if the user has an email address
     */
    async handleNotificationFor(user) {
        return user.getEmail() !== undefined;
    }
    /**
     * Send a notification email to a user
     *
     * Resolves the user's email, increments the sent metric, and delegates
     * to {@link send}. Increments the error metric on failure.
     *
     * @param user - User or Ident to send the notification to
     * @param notification - Template name for the notification
     * @param replacements - Template variables for rendering
     * @throws Error if the user has no valid email address
     * @override
     */
    async sendNotification(user, notification, replacements) {
        const email = user.getEmail();
        if (!email) {
            throw new Error(`Cannot find a valid email for ${user}`);
        }
        this.metrics.sent.inc();
        try {
            await this.send({
                template: notification,
                replacements: {
                    ...replacements
                },
                to: email
            });
        }
        catch (err) {
            this.metrics.errors.inc();
            throw err;
        }
    }
}
/**
 * A basic Mailer based on the nodemailer module
 *
 * Inside config it is the nodemailer module option for the method createTransport ( https://nodemailer.com/ )
 *
 * Only ses transport module is installed by default
 *
 * Parameters
 * config: { ... }
 * @category CoreServices
 * @WebdaModda
 */
class Mailer extends AbstractMailer {
    constructor() {
        super(...arguments);
        /** Cache of loaded email template instances by name */
        this._templates = {};
    }
    /**
     * Load and instantiate mailer parameters with defaults
     *
     * @param params - Raw service parameters
     * @returns Loaded MailerParameters instance
     * @ignore
     */
    loadParameters(params) {
        return new MailerParameters().load(params);
    }
    /**
     * Initialize the nodemailer transport from the service parameters
     *
     * @returns this instance after transport creation
     * @override
     */
    async init() {
        this._transporter = nodemailer.createTransport(this.parameters);
        return this;
    }
    /**
     * Get or create a cached email template instance by name
     *
     * Lazily creates and caches an Email template using the configured
     * templates directory and engine. Logs a warning if the template does not exist.
     *
     * @param name - Template name (must correspond to a directory in the templates folder)
     * @returns The email template instance, or undefined if the template does not exist
     */
    _getTemplate(name) {
        if (!this._templates[name]) {
            if (!this.hasNotification(name)) {
                this.log("WARN", "No template found for", name);
                return;
            }
            this._templates[name] = new Email({
                ...this.parameters.emailTemplateOptions,
                views: {
                    root: this.parameters.templates,
                    options: {
                        extension: this.parameters.templatesEngine
                    }
                }
            });
        }
        return this._templates[name];
    }
    /**
     * Check if an email template exists on the filesystem
     *
     * @param name - Template name to check
     * @returns true if the template directory exists
     */
    hasNotification(name) {
        // Load template
        return fs.existsSync(this.parameters.templates + name);
    }
    /**
     * Send an email using the configured nodemailer transport
     *
     * If a template is specified in options, it will be rendered with the
     * provided replacements before sending. A `now` Date variable is
     * automatically added to replacements. Falls back to `parameters.sender`
     * if no `from` is provided.
     *
     * @param options - Mail options including optional template and replacements
     * @param callback - Optional callback passed to nodemailer's sendMail
     * @returns Promise resolving with the nodemailer send result
     * @throws Error if no transporter is configured or the template is unknown
     */
    async send(options, callback = undefined) {
        if (this._transporter === undefined) {
            this.log("ERROR", "Cannot send email as no transporter is defined");
            return Promise.reject("Cannot send email as no transporter is defined");
        }
        if (!options.from) {
            options.from = this.parameters.sender;
        }
        if (options.template) {
            if (!options.replacements) {
                options.replacements = {};
            }
            options.replacements.now = new Date();
            const template = this._getTemplate(options.template);
            if (template) {
                const result = await template.renderAll(options.template, options.replacements);
                if (result.subject) {
                    options.subject = result.subject;
                }
                if (result.html) {
                    options.html = result.html;
                }
                if (result.text) {
                    options.text = result.text;
                }
            }
            else {
                throw Error("Unknown mail template");
            }
        }
        return this._transporter.sendMail(options, callback);
    }
}
export { Mailer };
//# sourceMappingURL=mailer.js.map