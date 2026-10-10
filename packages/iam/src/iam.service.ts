import {
  OperationAuthorizer,
  OperationContext,
  registerOperationAuthorizer,
  Service,
  ServiceParameters,
  useCoreEvents,
  WebContext,
  WebdaError
} from "@webda/core";
import { useRepository } from "@webda/models";
import { useLog } from "@webda/workout";
import { IAM_ALLOWED_OPERATION, IAM_AUTHORIZER } from "./active.js";
import {
  attachmentsFromConfig,
  compileAttachments,
  compilePolicies,
  PolicyAttachment,
  PolicyDocument,
  PolicyRow,
  validatePolicyDocument,
  validateStatements
} from "./compiler.js";
import { PolicyCompileError } from "./conditions.js";
import { IAMRequestContext, PolicyEngine } from "./engine.js";
import { iamGlobMatch, OPERATION_PATTERN } from "./glob.js";
import { IAMPolicy } from "./iampolicy.model.js";
import { IAMPolicyAttachment } from "./iampolicyattachment.model.js";

/**
 * Operations of the IAM models: always governed by IAM
 */
export const IAM_OPERATIONS = ["IAMPolicy.*", "IAMPolicies.*", "IAMPolicyAttachment.*", "IAMPolicyAttachments.*"];

/**
 * @param operationId - the operation id
 * @returns true for an operation of the IAM models
 */
export function isIAMOperation(operationId: string): boolean {
  return IAM_OPERATIONS.some(pattern => iamGlobMatch(operationId, pattern));
}

/**
 * Drop the IAM decision recorded on a context once its operation ended (success or failure, including a refusal by
 * another authorizer): core leaves the `operation` extension set, so a kept marker would still satisfy the IAM models'
 * canAct after the call. Synchronous: core runs it before callOperation returns
 * @param evt - the operation event
 * @param evt.context - the operation context
 * @param evt.operationId - the operation id
 */
function clearAllowedOperation(evt: { context: OperationContext; operationId: string }): void {
  if (evt.context?.getExtension?.(IAM_ALLOWED_OPERATION) === evt.operationId) {
    evt.context.setExtension(IAM_ALLOWED_OPERATION, undefined);
  }
}

/**
 * Repository events that trigger a rebuild
 */
const RELOAD_EVENTS = ["Created", "Updated", "Patched", "Deleted"] as const;

/**
 * @inheritdoc
 */
export class IAMServiceParameters extends ServiceParameters {
  /**
   * Operation id globs governed by IAM
   *
   * @default ["*"]
   */
  scope: string[];
  /**
   * Policies defined in configuration (read-only)
   */
  policies: PolicyDocument[];
  /**
   * Principal to policy names
   */
  attachments: Record<string, string[]>;
  /**
   * Debounce of a rebuild after a model change, in ms
   *
   * @default 100
   */
  reloadDelay: number;
  /**
   * Periodic rebuild, in seconds; 0 disables
   *
   * @default 300
   */
  reloadInterval: number;

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.scope ??= ["*"];
    this.policies ??= [];
    this.attachments ??= {};
    this.reloadDelay ??= 100;
    this.reloadInterval ??= 300;
    return this;
  }
}

/**
 * @param model - a model class
 * @returns its repository, or undefined when no store holds it
 */
function tryRepository(model: any): any {
  try {
    return useRepository(model);
  } catch {
    return undefined;
  }
}

/**
 * @param value - a value
 * @returns a deep-frozen plain clone
 * @throws when the value cannot be serialized: the authorizer then refuses (fail closed), an empty substitute could
 * satisfy negative conditions
 */
function frozenClone<T>(value: T): T {
  if (value === undefined) {
    return undefined;
  }
  const clone: any = JSON.parse(JSON.stringify(value));
  const freeze = (o: any) => {
    if (o && typeof o === "object") {
      Object.values(o).forEach(freeze);
      Object.freeze(o);
    }
    return o;
  };
  return freeze(clone);
}

/**
 * The current user's IAM view, cached on the context while loading
 */
type IAMUserCache = { uuid: string; user: Promise<IAMRequestContext["user"] | undefined> };

/**
 * Enforce IAM policies on operations, evaluated with Casbin
 *
 * Policies come from the configuration and from the IAMPolicy / IAMPolicyAttachment models
 *
 * @WebdaModda
 */
export class IAMService<T extends IAMServiceParameters = IAMServiceParameters> extends Service<T> {
  /**
   * Current snapshot; undefined until init
   */
  protected engine?: PolicyEngine;
  /**
   * Compiled configuration policies
   */
  protected configRows: PolicyRow[] = [];
  /**
   * Names of the configuration policies
   */
  protected configNames = new Set<string>();
  /**
   * The registered authorizer
   */
  protected authorizer?: OperationAuthorizer;
  /**
   * Debounce timer
   */
  protected reloadTimer?: NodeJS.Timeout;
  /**
   * Periodic timer
   */
  protected intervalTimer?: NodeJS.Timeout;
  /**
   * Repository listener removers
   */
  protected unsubscribers: (() => void)[] = [];
  /**
   * Generation of the latest started rebuild: an older rebuild finishing late never replaces a newer snapshot
   */
  protected generation = 0;
  /**
   * True once stopped: the authorizer stays registered and refuses in-scope operations
   */
  protected stopped = false;

  /**
   * Validate and compile the configuration, register the authorizer
   * @returns this
   */
  resolve(): this {
    super.resolve();
    const invalid = this.parameters.scope.find(
      pattern => typeof pattern !== "string" || !OPERATION_PATTERN.test(pattern)
    );
    if (invalid !== undefined) {
      throw new PolicyCompileError(`Invalid scope pattern ${JSON.stringify(invalid)}`);
    }
    this.configRows = compilePolicies(this.parameters.policies);
    this.configNames = new Set(this.parameters.policies.map(policy => policy.name));
    if (!this.authorizer) {
      this.authorizer = Object.assign(
        (context: OperationContext, operationId: string, _operation: any, options: { input?: any; probe: boolean }) =>
          this.authorize(context, operationId, options),
        // Liveness for the IAM models' canAct: false until the policies are loaded, and again once stopped
        { [IAM_AUTHORIZER]: () => this.engine !== undefined }
      );
      registerOperationAuthorizer(this.authorizer);
    }
    return this;
  }

  /**
   * Watch for changes, then load the stored policies and build the engine
   *
   * Listeners and the periodic rebuild start first: when the first build fails, init() throws but a later
   * successful rebuild (after the stored policy is fixed) still recovers; until then in-scope calls are refused
   * @returns this
   * @throws PolicyCompileError when the first build fails
   */
  async init(): Promise<this> {
    await super.init();
    this.stopped = false;
    // Nothing is marked before the policies are loaded, nor after stop (the engine is dropped)
    for (const event of ["Webda.OperationSuccess", "Webda.OperationFailure"] as const) {
      this.unsubscribers.push(useCoreEvents(event, clearAllowedOperation));
    }
    for (const model of [IAMPolicy, IAMPolicyAttachment]) {
      const repository = tryRepository(model);
      if (!repository) {
        continue;
      }
      for (const event of RELOAD_EVENTS) {
        const listener = () => this.scheduleReload();
        repository.on(event, listener);
        this.unsubscribers.push(() => repository.off(event, listener));
      }
    }
    if (this.parameters.reloadInterval > 0) {
      this.intervalTimer = setInterval(() => this.reload(), this.parameters.reloadInterval * 1000);
      this.intervalTimer.unref?.();
    }
    const generation = ++this.generation;
    let engine: PolicyEngine;
    try {
      engine = await this.build();
    } catch (err) {
      useLog(
        "ERROR",
        "IAM policies could not be loaded: in-scope operations are refused until a rebuild succeeds",
        err
      );
      throw err;
    }
    // A rebuild started meanwhile wins, unless it has not finished yet
    if (!this.stopped && (generation === this.generation || !this.engine)) {
      this.engine = engine;
    }
    return this;
  }

  /**
   * Stop watching and drop the policies
   *
   * The authorizer stays registered: in-scope operations are refused during and after a graceful shutdown
   */
  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.reloadTimer);
    clearInterval(this.intervalTimer);
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
    // Drop the snapshot: a stopped service refuses, and an in-flight rebuild is discarded
    this.generation++;
    this.engine = undefined;
    await super.stop();
  }

  /**
   * @param operationId - the operation id
   * @returns true when IAM governs the operation
   */
  isInScope(operationId: string): boolean {
    return [...IAM_OPERATIONS, ...this.parameters.scope].some(pattern => iamGlobMatch(operationId, pattern));
  }

  /**
   * Authorize an operation call; an allowed (non-probe) IAM model operation is recorded on the context
   * ({@link IAM_ALLOWED_OPERATION}) for the IAM models' canAct
   * @param context - the caller context
   * @param operationId - the operation id
   * @param options - input and probe mode
   * @param options.input - the resolved operation input
   * @param options.probe - true for a listing probe (no input)
   * @returns true or the refusal reason
   * @throws WebdaError.BadRequest for an invalid IAMPolicy input
   */
  async authorize(
    context: OperationContext,
    operationId: string,
    options: { input?: any; probe: boolean }
  ): Promise<true | string> {
    // The IAM models' canAct only allows an operation recorded here: a probe neither records nor clears
    const record = !options.probe && isIAMOperation(operationId);
    if (record) {
      context.setExtension?.(IAM_ALLOWED_OPERATION, undefined);
    }
    const allowed = await this.decide(context, operationId, options);
    if (record && allowed === true) {
      context.setExtension?.(IAM_ALLOWED_OPERATION, operationId);
    }
    return allowed;
  }

  /**
   * Decide on an operation call
   * @param context - the caller context
   * @param operationId - the operation id
   * @param options - input and probe mode
   * @param options.input - the resolved operation input
   * @param options.probe - true for a listing probe (no input)
   * @returns true or the refusal reason
   * @throws WebdaError.BadRequest for an invalid IAMPolicy input
   */
  protected async decide(
    context: OperationContext,
    operationId: string,
    options: { input?: any; probe: boolean }
  ): Promise<true | string> {
    if (!this.isInScope(operationId)) {
      return true;
    }
    if (!this.engine) {
      return "IAM policies are not loaded";
    }
    const request = await this.buildRequest(context, operationId, options);
    if (typeof request === "string") {
      useLog("DEBUG", `IAM refused ${operationId}`, request);
      return request;
    }
    const { principals, ctx } = request;
    const decision = await this.engine.decide(principals, operationId, ctx);
    if (decision !== true) {
      useLog("DEBUG", `IAM refused ${operationId} for ${principals.join(", ")}`, decision);
      return decision;
    }
    if (!options.probe) {
      this.checkPolicyInput(operationId, options.input);
    }
    return true;
  }

  /**
   * Validate the input of an IAMPolicy write: models have no validate hook
   * @param operationId - the operation id
   * @param input - the operation input
   * @throws WebdaError.BadRequest when invalid
   */
  protected checkPolicyInput(operationId: string, input: any): void {
    if (!/^IAMPolicy\.(Create|Update|Patch)$/.test(operationId) || !input) {
      return;
    }
    try {
      if (operationId === "IAMPolicy.Create") {
        // The whole document: a stored policy that cannot compile would freeze every rebuild
        validatePolicyDocument(input);
      } else if (input.statements !== undefined) {
        validateStatements(input.statements);
      }
      if (operationId === "IAMPolicy.Create" && this.configNames.has(input.name)) {
        throw new PolicyCompileError(`Policy ${input.name} is defined in configuration`);
      }
    } catch (err) {
      if (err instanceof PolicyCompileError) {
        throw new WebdaError.BadRequest(err.message);
      }
      throw err;
    }
  }

  /**
   * Build the principals and the `r.ctx` of a request
   * @param context - the caller context
   * @param operationId - the operation id
   * @param options - input and probe mode
   * @param options.input - the resolved operation input
   * @param options.probe - true for a listing probe (no input)
   * @returns principals and request context, or the refusal reason when the current user cannot be loaded
   */
  protected async buildRequest(
    context: OperationContext,
    operationId: string,
    options: { input?: any; probe: boolean }
  ): Promise<{ principals: string[]; ctx: IAMRequestContext } | string> {
    const userId = context.getCurrentUserId?.();
    let user: IAMRequestContext["user"];
    if (userId) {
      // The in-flight load is shared on the context: a listing asks for many operations at once
      let cached = context.getExtension?.<IAMUserCache>("iamUser");
      if (!cached || cached.uuid !== userId) {
        cached = { uuid: userId, user: this.loadUser(context, userId) };
        context.setExtension?.("iamUser", cached);
      }
      user = await cached.user;
      if (!user) {
        // Without its groups, a deny attached to a group would be skipped: refuse, and do not cache the failure
        if (context.getExtension?.("iamUser") === cached) {
          context.setExtension?.("iamUser", undefined);
        }
        return "current user could not be loaded";
      }
    }
    const principals = user
      ? [`user:${user.uuid}`, ...user.groups.map(group => `group:${group}`), "authenticated"]
      : ["anonymous"];
    let http: IAMRequestContext["http"];
    if (context instanceof WebContext) {
      const httpContext = context.getHttpContext();
      if (httpContext) {
        http = { method: httpContext.getMethod(), ip: httpContext.getClientIp(), host: httpContext.getHostName() };
      }
    }
    const ctx: IAMRequestContext = Object.freeze({
      operationId,
      probe: options.probe,
      user: frozenClone(user),
      session: frozenClone(context.getSession?.()),
      input: options.input === undefined ? (options.probe ? undefined : Object.freeze({})) : frozenClone(options.input),
      http: frozenClone(http),
      now: Date.now()
    });
    return { principals, ctx };
  }

  /**
   * Load the current user's groups and roles
   * @param context - the caller context
   * @param userId - the current user id
   * @returns the user, or undefined when it cannot be loaded
   */
  protected async loadUser(context: OperationContext, userId: string): Promise<IAMRequestContext["user"] | undefined> {
    let model: any;
    try {
      model = await context.getCurrentUser();
    } catch (err) {
      useLog("WARN", "IAM could not load the current user", err);
    }
    if (!model) {
      return undefined;
    }
    return { uuid: userId, groups: model.getGroups?.() ?? [], roles: model.getRoles?.() ?? [] };
  }

  /**
   * Compile configuration and stored policies into a new engine
   * @returns the engine
   * @throws PolicyCompileError for an invalid stored policy or one shadowing a configuration policy
   */
  protected async build(): Promise<PolicyEngine> {
    const policies: PolicyDocument[] = [];
    const attachments: PolicyAttachment[] = attachmentsFromConfig(this.parameters.attachments);
    const policyRepository = tryRepository(IAMPolicy);
    if (policyRepository) {
      for await (const policy of policyRepository.iterate("")) {
        if (this.configNames.has(policy.name)) {
          throw new PolicyCompileError(`Policy ${policy.name} shadows a configuration policy`);
        }
        policies.push(
          validatePolicyDocument({ name: policy.name, description: policy.description, statements: policy.statements })
        );
      }
    }
    const attachmentRepository = tryRepository(IAMPolicyAttachment);
    if (attachmentRepository) {
      for await (const attachment of attachmentRepository.iterate("")) {
        attachments.push({ principal: attachment.principal, policy: attachment.policy });
      }
    }
    const rows = [...this.configRows, ...compilePolicies(policies)];
    const known = new Set([...this.configNames, ...policies.map(policy => policy.name)]);
    const { rows: links, ignored } = compileAttachments(attachments, known);
    ignored.forEach(a => useLog("WARN", `IAM attachment of ${a.principal} to ${a.policy} ignored`));
    return PolicyEngine.build(rows, links);
  }

  /**
   * Rebuild the engine; keep the previous one when the rebuild fails (fail closed)
   */
  async reload(): Promise<void> {
    const generation = ++this.generation;
    try {
      const engine = await this.build();
      if (generation === this.generation && !this.stopped) {
        this.engine = engine;
      }
    } catch (err) {
      useLog("ERROR", "IAM rebuild failed, keeping the previous policies", err);
    }
  }

  /**
   * Schedule a debounced rebuild
   */
  protected scheduleReload(): void {
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => this.reload(), this.parameters.reloadDelay);
    this.reloadTimer.unref?.();
  }
}
