import {
  Mailer,
  Service,
  Store,
  Context,
  EventStoreActioned,
  EventAuthenticationRegister,
  ExposeParameters,
  Ident
} from "../index";
import { AclModel } from "../models/aclmodel";
import { CoreModel } from "../models/coremodel";
import { Authentication } from "./authentication";
import { DeepPartial, Inject, ServiceParameters } from "./service";

interface Invitation {
  /**
   * User to invite to target
   */
  users: string[];
  /**
   * Ident uuid to target
   */
  idents: string[];
  /**
   * Any additional data to include with the invite
   */
  metadata: any;
}

/**
 *
 */
export class InvitationParameters extends ServiceParameters {
  /**
   * Name of the bean to use for Authentication
   *
   * @default Authentication
   */
  authenticationService: string;
  /**
   * Mailer
   *
   * @default Mailer
   */
  mailerService: string;
  /**
   * Store to use
   */
  modelStore: string;
  /**
   * Used to store pending invitation
   */
  invitationStore: string;
  /**
   * Fields to duplicate
   */
  mapFields: string[];
  /**
   * Attribute to use for the mapping
   */
  mapAttribute: string;
  /**
   * Attribute where to store once the invitation is accepted
   *
   * If attribute is __acls, the multiple will be ignored and the storage
   * will be compatible with AclModel
   *
   * Where to store within the model User
   */
  attribute: string;
  /**
   * Attribute where to store once the invitation is created and pending
   *
   * Where to store within the model Ident and User
   */
  pendingAttribute: string;
  /**
   * Define if several invitation can be accepted or just one
   */
  multiple: boolean;
  /**
   * Do not require a validation by the invitee
   */
  autoAccept: boolean;
  /**
   * Email template to send to the user
   */
  emailTemplate: string;

  constructor(params: any) {
    super(params);
    this.authenticationService ??= "Authentication";
    if (typeof this.mapFields === "string") {
      this.mapFields = (<string>this.mapFields).split(",");
    }
    this.multiple ??= true;
    if (!this.attribute.startsWith("_")) {
      throw new Error(`Attribute '${this.attribute}' needs to start with a _ to be only modified by server`);
    }
    this.pendingAttribute ??= `${this.attribute}Pending`;
    if (!this.pendingAttribute.startsWith("_")) {
      throw new Error(`Attribute '${this.pendingAttribute}' needs to start with a _ to be only modified by server`);
    }
    if (this.autoAccept && !this.multiple) {
      throw new Error(`You cannot have multiple=false with autoAccept=true`);
    }
  }
}

/**
 * Allow to use invitation on AclModel
 *
 * Once you add a new ACE with a user, it will invite
 * and act as Mapper
 */
export default class InvitationService<T extends InvitationParameters = InvitationParameters> extends Service<T> {
  @Inject("params:authenticationService")
  authenticationService: Authentication;

  @Inject("params:mailerService")
  mailerService: Mailer;

  @Inject("params:invitationStore")
  invitationStore: Store<CoreModel>;

  @Inject("params:modelStore")
  modelStore: Store<AclModel | CoreModel>;

  /**
   * @inheritdoc
   */
  loadParameters(params: DeepPartial<T>) {
    return new InvitationParameters(params);
  }

  /**
   * @inheritdoc
   */
  resolve() {
    super.resolve();
    if (!this.mailerService.hasTemplate(this.parameters.emailTemplate)) {
      throw new Error(`Email template should exist`);
    }
    // Register
    this.authenticationService.on("Authentication.Register", (evt: EventAuthenticationRegister) =>
      this.registrationListener(evt)
    );
    const url = (<ExposeParameters>this.modelStore.getParameters().expose).url;
    this.addRoute(`${url}/{uuid}/invitations`, ["GET", "POST", "PUT", "DELETE"], this.invite);
  }

  async acceptInvitation(ctx: Context, model: CoreModel) {
    // Need to specify if you accept or not
    if (typeof ctx.getRequestBody().accept !== "boolean") {
      throw 400;
    }
    const user = await ctx.getCurrentUser();
    let metadata = undefined;
    user.getIdents().forEach(i => {
      if (model[this.parameters.pendingAttribute][`ident_${i.getUuid()}`]) {
        metadata = model[this.parameters.pendingAttribute][`ident_${i.getUuid()}`];
        delete model[this.parameters.pendingAttribute][`ident_${i.getUuid()}`];
      }
    });
    if (model[this.parameters.pendingAttribute][`user_${user.getUuid()}`]) {
      metadata = model[this.parameters.pendingAttribute][`user_${user.getUuid()}`];
      delete model[this.parameters.pendingAttribute][`user_${user.getUuid()}`];
    }
    if (metadata && ctx.getRequestBody().accept) {
      model[this.parameters.attribute][user.getUuid()] = metadata;
    }
    await this.updateModel(model);
  }

  protected async updateModel(model) {
    await model.update({
      [this.parameters.attribute]: model[this.parameters.attribute],
      [this.parameters.pendingAttribute]: model[this.parameters.pendingAttribute]
    });
  }

  async uninvite(ctx: Context, model: CoreModel) {
    const body: Invitation = ctx.getRequestBody();
    body.users ??= [];
    body.idents ??= [];
    const promises = [];
    for (const ident of body.idents) {
      if (model[this.parameters.pendingAttribute][`ident_${ident}`]) {
        // Remove from pending on the object
        delete model[this.parameters.pendingAttribute][`ident_${ident}`];
        // Remove from pending from the invitation store
        promises.push(
          this.invitationStore.removeAttribute(
            `${ident}_${this.getName()}`,
            this.getInvitationAttribute(model.getUuid())
          )
        );
      } else {
        // Remove user
        promises.push(
          (async () => {
            const id = await this.authenticationService.getIdentStore().get(ident);
            if (id && id.getUser()) {
              delete model[this.parameters.attribute][id.getUser()];
            }
          })()
        );
      }
    }
    for (const user of body.users) {
      if (model[this.parameters.pendingAttribute][`user_${user}`]) {
        delete model[this.parameters.pendingAttribute][`user_${user}`];
      } else if (model[this.parameters.attribute][user]) {
        delete model[this.parameters.attribute][user];
      }
    }
    await Promise.all(promises);
    //
    await this.updateModel(model);
  }

  async invite(ctx: Context) {
    let model = await this.modelStore.get(ctx.getParameters().uuid);
    if (!model) {
      throw 404;
    }
    model[this.parameters.attribute] ??= {};
    model[this.parameters.pendingAttribute] ??= {};
    //const invitations: Invitation[] = model[this.getParameters().pendingAttribute];
    if (ctx.getHttpContext().getMethod() === "DELETE") {
      await model.canAct(ctx, "uninvite");
      return this.uninvite(ctx, model);
    } else if (ctx.getHttpContext().getMethod() === "PUT") {
      return this.acceptInvitation(ctx, model);
    }
    await model.canAct(ctx, "invite");
    const body: Invitation = ctx.getRequestBody();
    // For each ident
    const identsStore = this.authenticationService.getIdentStore();
    // Load all idents with orignal
    const invitations: { invitation: string; ident: Ident }[] = await Promise.all(
      (body.idents || []).map(async i => ({
        ident: await identsStore.get(i),
        invitation: i
      }))
    );

    let promises = [];

    for (const invitation of invitations) {
      if (invitation.ident) {
        if (this.parameters.autoAccept) {
          model[this.parameters.attribute][invitation.ident.getUser()] = body.metadata;
        } else if (!model[this.parameters.attribute][invitation.ident.getUser()]) {
          // Add to the user
          model[this.parameters.pendingAttribute][`user_${invitation.ident.getUser()}`] = body.metadata;
        }
        continue;
      }
      let invitUuid = `${invitation.invitation}_${this.getName()}`;
      model[this.parameters.pendingAttribute] ??= {};
      model[this.parameters.pendingAttribute][`ident_${invitation.invitation}`] = body.metadata;
      if (await this.invitationStore.exists(invitUuid)) {
        promises.push(
          this.invitationStore.patch({
            uuid: invitUuid,
            [this.getInvitationAttribute(model.getUuid())]: body.metadata
          })
        );
      } else {
        promises.push(
          this.invitationStore.save({
            uuid: invitUuid,
            [this.getInvitationAttribute(model.getUuid())]: body.metadata
          })
        );
      }
    }
    // Check user direct invite
    body.users ??= [];
    promises.push(
      ...body.users.map(async u => {
        let user = await this.authenticationService.getUserStore().get(u);
        if (!user) {
          return;
        }
        if (this.parameters.autoAccept) {
          model[this.parameters.attribute][u] = body.metadata;
        } else if (!model[this.parameters.attribute][u]) {
          model[this.parameters.pendingAttribute][`user_${u}`] = body.metadata;
        }
      })
    );

    await Promise.all(promises);
    // Update model now
    await this.updateModel(model);
  }

  /**
   * Return which attribute would be used to store the invitation on ident invitation object
   * @param uuid
   * @returns
   */
  getInvitationAttribute(uuid: string) {
    return `invit_${uuid}`;
  }

  /**
   * When a user register with an invited idents, managed the whole invitation process
   *
   * @param evt
   * @returns
   */
  async registrationListener(evt: EventAuthenticationRegister) {
    let uuid = `${evt.identId}_${this.getName()}`;
    const invitations = await this.invitationStore.get(uuid);
    if (!invitations) {
      return;
    }
    this.log("DEBUG", `Resolving invitation for ident ${evt.identId}`);
    // Load all models invited too
    const models = await Promise.all(
      Object.keys(invitations)
        .filter(k => k.startsWith("invit_"))
        .map(k => this.modelStore.get(k.substr(6)))
    );

    // autoAccept is on so move to __acls
    const promises = [];

    if (!this.parameters.autoAccept) {
      // If autoAccept is false, just copy the pending invitation in the user
      evt.user[this.parameters.pendingAttribute] ??= {};
      evt.user[this.parameters.pendingAttribute] = models
        .filter(m => m !== undefined)
        .map(m => ({
          uuid: m.getUuid()
        }));
    } else {
      for (const model of models) {
        if (!model) {
          continue;
        }
        // Set the metadata
        model[this.parameters.attribute][evt.user.getUuid()] =
          invitations[this.getInvitationAttribute(model.getUuid())];
        // Remove pending
        delete model[this.parameters.pendingAttribute][`ident_${evt.identId}`];
        promises.push(this.updateModel(model));
      }
    }

    promises.push(invitations.delete());
    await Promise.all(promises);
  }
}
