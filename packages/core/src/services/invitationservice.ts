import {
  EventAuthenticationRegister,
  EventWithContext,
  Ident,
  OperationContext,
  Store,
  WebContext,
  WebdaError
} from "../index";
import { CoreModel, CoreModelDefinition } from "../models/coremodel";
import { User } from "../models/user";
import { Authentication } from "./authentication";
import { NotificationService } from "./notificationservice";
import { DeepPartial, Inject, Service, ServiceParameters } from "./service";

interface InvitationAnswerBody {
  accept: boolean;
}

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
  /**
   * Notification info to pass to the notification service
   */
  notification?: any;
}

/**
 * Emitted when an invitation is sent
 */
export interface EventInvitationSent extends EventWithContext {
  /**
   * Invited users
   */
  users: User[];
  /**
   * Invited idents if user is not registered yet
   */
  idents: string[];
  /**
   * Metadata of the invite
   */
  metadata: any;
  /**
   * Object targetted by the invite
   */
  model: CoreModel;
}

/**
 * Emitted when an invitation is removed
 */
export interface EventInvitationRemoved extends EventWithContext {
  /**
   * Invited users id
   */
  users: string[];
  /**
   * Invited idents if user is not registered yet
   */
  idents: string[];
  /**
   * Metadata of the invite
   */
  metadata: any;
  /**
   * Object targetted by the invite
   */
  model: CoreModel;
}

/**
 * Emitted when an invitation is accepted
 */
export interface EventInvitationAnswered extends EventWithContext {
  /**
   * Object targetted by the invite
   */
  model: CoreModel;
  /**
   * Metadata of the invite
   */
  metadata: any;
  /**
   * If the invitation got accepted or not
   */
  accept: boolean;
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
   * Notification service
   *
   * @default Mailer
   */
  notificationService?: string;
  /**
   * Model to use
   */
  model: string;
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
  notification?: string;

  constructor(params: any) {
    super(params);
    this.authenticationService ??= "Authentication";
    if (typeof this.mapFields === "string") {
      this.mapFields = (<string>this.mapFields).split(",");
    }
    this.mapFields ??= [];
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
 *
 * @WebdaModda
 */
export class InvitationService<T extends InvitationParameters = InvitationParameters> extends Service<T> {
  @Inject("params:authenticationService")
  authenticationService: Authentication;

  // Optional service
  @Inject("params:notificationService", true)
  notificationService: NotificationService;

  @Inject("params:invitationStore")
  invitationStore: Store<CoreModel>;
  /**
   * CoreModel to manage invitation on
   */
  model: CoreModelDefinition;

  /**
   * @inheritdoc
   */
  loadParameters(params: DeepPartial<T>) {
    return new InvitationParameters(params);
  }

  /**
   * @inheritdoc
   */
  resolve(): this {
    super.resolve();
    // Register
    this.authenticationService.on("Authentication.Register", (evt: EventAuthenticationRegister) =>
      this.registrationListener(evt)
    );
    this.model = this.getWebda().getModel(this.parameters.model);
    const url =
      this.getParameters().url || `/${this.getWebda().getApplication().getModelPlural(this.parameters.model)}`;
    // Register routes
    this.addRoute(`${url}/{uuid}/invitations`, ["GET", "POST", "PUT", "DELETE"], this.invite, {
      tags: [this.getWebda().getApplication().getModelPlural(this.model.getIdentifier())],
      summary: "Invite users to this object",
      get: {
        summary: "Retrieve all pending invitations",
        responses: {
          "200": {
            description: "List of pending invitations",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: {
                    type: "object"
                  }
                }
              }
            }
          },
          "403": {
            description: "Forbidden"
          }
        }
      },
      put: {
        summary: "Accept/Refuse an invitation",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  accept: {
                    type: "boolean"
                  }
                }
              }
            }
          }
        },
        responses: {
          "204": {
            description: "Operation successful"
          },
          "410": {
            description: "Invitation is gone"
          }
        }
      },
      delete: {
        summary: "Remove invitation",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  users: {
                    type: "array",
                    items: {
                      type: "string"
                    }
                  },
                  idents: {
                    type: "array",
                    items: {
                      type: "string"
                    }
                  },
                  metadata: {
                    type: "object"
                  },
                  notification: {
                    type: "object"
                  }
                }
              }
            }
          }
        },
        responses: {
          "204": {},
          "403": {
            description: "Forbidden"
          }
        }
      },
      post: {
        summary: "Invite users",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  users: {
                    type: "array",
                    items: {
                      type: "string"
                    }
                  },
                  idents: {
                    type: "array",
                    items: {
                      type: "string"
                    }
                  },
                  metadata: {
                    type: "object"
                  },
                  notification: {
                    type: "object"
                  }
                }
              }
            }
          }
        },
        responses: {
          "204": {},
          "403": {
            description: "Forbidden"
          }
        }
      }
    });
    return this;
  }

  /**
   * @inheritdoc
   */
  async init(): Promise<this> {
    await super.init();
    if (
      this.parameters.notification &&
      !(await this.notificationService.hasNotification(this.parameters.notification))
    ) {
      throw new Error(`Email template should exist`);
    }
    return this;
  }

  /**
   * Accept or refuse for an invitation
   * @param ctx
   * @param model
   */
  async answerInvitation(ctx: WebContext<InvitationAnswerBody>, model: CoreModel) {
    const body = await ctx.getInput();
    // Invitation on the model is gone
    if (model === undefined) {
      await this.removeInvitationFromUser(ctx.getCurrentUserId(), ctx.getParameters().uuid);
      throw new WebdaError.Gone("Invitation is gone");
    }
    const user = await ctx.getCurrentUser();
    let metadata = undefined;
    user.getIdents().forEach(i => {
      if (model[this.parameters.pendingAttribute][`ident_${i.uuid}`]) {
        metadata = model[this.parameters.pendingAttribute][`ident_${i.uuid}`];
        delete model[this.parameters.pendingAttribute][`ident_${i.uuid}`];
      }
    });
    if (model[this.parameters.pendingAttribute][`user_${user.getUuid()}`]) {
      metadata = model[this.parameters.pendingAttribute][`user_${user.getUuid()}`];
      delete model[this.parameters.pendingAttribute][`user_${user.getUuid()}`];
    }
    if (metadata && body.accept) {
      model[this.parameters.attribute][user.getUuid()] = metadata;
    }
    await this.updateModel(model);
    this.emit("Invitation.Accepted", <EventInvitationAnswered>{
      metadata,
      model,
      context: ctx,
      accept: body.accept
    });
  }

  /**
   * Update Model with pending and attribute
   *
   * @param model
   */
  protected async updateModel(model: CoreModel) {
    await model.patch({
      [this.parameters.attribute]: model[this.parameters.attribute],
      [this.parameters.pendingAttribute]: model[this.parameters.pendingAttribute]
    });
  }

  /**
   * Uninvite from previous invitations
   * @param ctx
   * @param model
   */
  async uninvite(ctx: OperationContext<Invitation>, model: CoreModel) {
    const body: Invitation = await ctx.getInput();
    body.users ??= [];
    body.idents ??= [];
    const promises = [];
    const invitedIdents: string[] = [];
    const invitedUsers: string[] = [];
    for (const ident of body.idents) {
      if (model[this.parameters.pendingAttribute][`ident_${ident}`]) {
        // Remove from pending on the object
        delete model[this.parameters.pendingAttribute][`ident_${ident}`];
        // Remove from pending from the invitation store
        promises.push(
          this.invitationStore.removeAttribute(
            `${ident}_${this.getName()}`,
            <any>this.getInvitationAttribute(model.getUuid())
          )
        );
        invitedIdents.push(ident);
      } else {
        // Remove user
        promises.push(
          (async () => {
            const id = await this.authenticationService.getIdentStore().get(ident);
            if (id && id.getUser()) {
              delete model[this.parameters.attribute][id.getUser()];
              await this.removeInvitationFromUser(id.getUser().toString(), model.getUuid());
              invitedUsers.push(id.getUser().toString());
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
      promises.push(this.removeInvitationFromUser(user, model.getUuid()));
      invitedUsers.push(user);
    }
    await Promise.all(promises);
    //
    await this.updateModel(model);
    this.emit("Invitation.Removed", <EventInvitationRemoved>{
      metadata: body.metadata,
      users: invitedUsers,
      idents: invitedIdents,
      model,
      context: ctx
    });
  }

  /**
   * Remove a model invitation from user
   * @param user
   */
  protected async removeInvitationFromUser(user: string, model: string): Promise<void> {
    const userModel = await this.authenticationService.getUserStore().get(user);
    let index = 0;
    for (const invit of userModel[this.parameters.mapAttribute] || []) {
      if (invit.model === model) {
        await this.authenticationService
          .getUserStore()
          .deleteItemFromCollection(user, <any>this.parameters.mapAttribute, index, model, "model");
        return;
      }
      index++;
    }
  }

  /**
   * Handle invitations all methods
   *
   * @param ctx
   * @returns
   */
  async invite(ctx: WebContext) {
    const model = await this.model.ref(ctx.getParameters().uuid).get(ctx);
    if (ctx.getHttpContext().getMethod() === "PUT") {
      return this.answerInvitation(ctx, model);
    }
    const inviter = await ctx.getCurrentUser();
    if (!model) {
      throw new WebdaError.NotFound("Model not found");
    }
    model[this.parameters.attribute] ??= {};
    model[this.parameters.pendingAttribute] ??= {};
    if (ctx.getHttpContext().getMethod() === "DELETE") {
      await model.checkAct(ctx, "uninvite");
      return this.uninvite(ctx, model);
    }
    await model.checkAct(ctx, "invite");
    // Retrieve invitation useful when invitation are hidden with a __
    if (ctx.getHttpContext().getMethod() === "GET") {
      ctx.write(model[this.parameters.pendingAttribute] || {});
      return;
    }
    const body: Invitation = await ctx.getRequestBody();
    // For each ident
    const identsStore = this.authenticationService.getIdentStore();
    // Load all idents with orignal
    const invitations: { invitation: string; ident: Ident }[] = await Promise.all(
      (body.idents || []).map(async i => ({
        ident: await identsStore.get(i),
        invitation: i
      }))
    );

    const invitedIdents: string[] = [];
    const invitedUsers: User[] = [];
    const promises = [];
    const metadata = {};
    this.parameters.mapFields.forEach(f => (metadata[f] = model[f]));

    for (const invitation of invitations) {
      // User is known
      if (invitation.ident) {
        if (this.parameters.autoAccept) {
          model[this.parameters.attribute][invitation.ident.getUser()] = body.metadata;
        } else if (!model[this.parameters.attribute][invitation.ident.getUser()]) {
          // Add to the user
          model[this.parameters.pendingAttribute][`user_${invitation.ident.getUser()}`] = body.metadata;
        }
        promises.push(
          (async () => {
            const user = await this.authenticationService.getUserStore().get(invitation.ident.getUser().toString());
            invitedUsers.push(user);
            await this.addInvitationToUser(model, user, inviter, metadata, body.notification);
          })()
        );
        continue;
      }
      // User is unknown to the platform
      invitedIdents.push(invitation.invitation);
      const invitUuid = `${invitation.invitation}_${this.getName()}`;
      model[this.parameters.pendingAttribute] ??= {};
      model[this.parameters.pendingAttribute][`ident_${invitation.invitation}`] = body.metadata;
      const invitInfo = {
        inviter: inviter.toPublicEntry(),
        metadata: body.metadata
      };
      if (await this.invitationStore.exists(invitUuid)) {
        promises.push(
          this.invitationStore.setAttribute(invitUuid, <any>this.getInvitationAttribute(model.getUuid()), invitInfo)
        );
      } else {
        promises.push(
          this.invitationStore.save({
            uuid: invitUuid,
            [this.getInvitationAttribute(model.getUuid())]: invitInfo
          })
        );
      }
      // Notify ident
      const ident = invitation.invitation.split("_");
      await this.sendNotification(
        new Ident().load(
          {
            _type: ident.pop(),
            uuid: ident.join("_")
          },
          true
        ),
        {
          model,
          metadata,
          notification: body.notification,
          inviter: inviter.toPublicEntry(),
          pending: !this.parameters.autoAccept,
          registered: true
        }
      );
    }
    // Check user direct invite
    body.users ??= [];
    promises.push(
      ...body.users.map(async u => {
        const user = await this.authenticationService.getUserStore().get(u);
        if (!user) {
          return;
        }
        if (this.parameters.autoAccept) {
          model[this.parameters.attribute][u] = body.metadata;
        } else if (!model[this.parameters.attribute][u]) {
          model[this.parameters.pendingAttribute][`user_${u}`] = body.metadata;
        }
        invitedUsers.push(user);
        await this.addInvitationToUser(model, user, inviter, metadata, body.notification);
      })
    );

    await Promise.all(promises);
    // Update model now
    await this.updateModel(model);
    this.emit("Invitation.Sent", <EventInvitationSent>{
      metadata: body.metadata,
      notification: body.notification,
      users: invitedUsers,
      idents: invitedIdents,
      model,
      context: ctx
    });
  }

  async addInvitationToUser(model: CoreModel, user: User, inviter: User, metadata: any, notification: any = {}) {
    if ((user[this.parameters.mapAttribute] || []).filter(p => p.model === model.getUuid()).length) {
      return;
    }
    await this.authenticationService
      .getUserStore()
      .upsertItemToCollection(user.getUuid(), <any>this.parameters.mapAttribute, {
        model: model.getUuid(),
        metadata,
        inviter: inviter.toPublicEntry(),
        pending: !this.parameters.autoAccept
      });
    // Notify user
    await this.sendNotification(user, {
      model,
      metadata,
      notification,
      inviter: inviter.toPublicEntry(),
      pending: !this.parameters.autoAccept,
      registered: true
    });
  }

  async sendNotification(user: User | Ident, replacements: any) {
    if (!this.parameters.notification) {
      return;
    }
    await this.notificationService.sendNotification(user, this.parameters.notification, replacements);
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
    const uuid = `${evt.identId}_${this.getName()}`;
    const invitations = await this.invitationStore.get(uuid);
    if (!invitations) {
      return;
    }
    this.log("DEBUG", `Resolving invitation for ident ${evt.identId}`);
    // Load all models invited too
    const infos = await Promise.all(
      Object.keys(invitations)
        .filter(k => k.startsWith("invit_"))
        .map(async k => ({
          ...invitations[k],
          model: await this.model.ref(k.substring(6)).get()
        }))
    );

    // autoAccept is on so move to __acls
    const promises = [];

    // If autoAccept is false, just copy the pending invitation in the user
    evt.user[this.parameters.mapAttribute] ??= [];
    evt.user[this.parameters.mapAttribute].push(
      ...infos
        .filter(m => m.model !== undefined)
        .map(m => {
          const metadata = {};
          this.parameters.mapFields.forEach(f => (metadata[f] = m.model[f]));
          return {
            model: m.model.getUuid(),
            metadata,
            inviter: m.inviter,
            pending: !this.parameters.autoAccept
          };
        })
    );
    if (this.parameters.autoAccept) {
      for (const info of infos) {
        if (!info.model) {
          continue;
        }
        // Set the metadata
        info.model[this.parameters.attribute][evt.user.getUuid()] = info.metadata;
        // Remove pending
        delete info.model[this.parameters.pendingAttribute][`ident_${evt.identId}`];
        promises.push(this.updateModel(info.model));
      }
    }

    promises.push(invitations.delete());
    await Promise.all(promises);
  }
}
