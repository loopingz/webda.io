import { Webda, _extend } from "./core";
import { Service } from "./services/service";
import { Executor } from "./services/executor";
// Policies
import { OwnerPolicy } from "./policies/ownerpolicy";
import { RolePolicyMixIn } from "./policies/rolepolicy";
import { AclPolicyMixIn } from "./policies/aclpolicy";
// Models
import { CoreModel, CoreModelDefinition } from "./models/coremodel";
import { Ident } from "./models/ident";
import { User } from "./models/user";
// Utils
import { Context, ClientInfo, HttpContext } from "./utils/context";
import { SecureCookie, SessionCookie } from "./utils/cookie";
// Store
import { Store } from "./stores/store";

import { FileStore } from "./stores/file";
import { MemoryStore } from "./stores/memory";
// Loggers
import { Logger } from "./loggers/logger";
import { MemoryLogger } from "./loggers/memorylogger";
import { ConsoleLogger } from "./loggers/consolelogger";
// Services
import { Mailer } from "./services/mailer";
import { DebugMailer } from "./services/debugmailer";
import {
  Authentication,
  PasswordRecoveryInfos,
  PasswordVerifier
} from "./services/authentication";
import { EventService } from "./services/asyncevents";
import { Binary } from "./services/binary";
import { FileBinary } from "./services/filebinary";
import { ResourceService } from "./services/resource";
import {
  ConfigurationProvider,
  ConfigurationService
} from "./services/configuration";
// Queues
import { Queue } from "./queues/queueservice";
import { MemoryQueue } from "./queues/memoryqueue";

export {
  Webda as Core,
  _extend,
  // Services
  Service,
  Executor,
  EventService,
  ResourceService,
  Binary,
  FileBinary,
  Mailer,
  DebugMailer,
  Authentication,
  ConfigurationProvider,
  ConfigurationService,
  PasswordRecoveryInfos,
  PasswordVerifier,
  // Policies
  OwnerPolicy,
  RolePolicyMixIn,
  AclPolicyMixIn,
  // Store
  Store,
  FileStore,
  MemoryStore,
  // Queues
  Queue,
  MemoryQueue,
  // Models
  CoreModel,
  CoreModelDefinition,
  Ident,
  User,
  // Utils
  SessionCookie,
  SecureCookie,
  Context,
  ClientInfo,
  HttpContext,
  // Handler
  Logger,
  MemoryLogger,
  ConsoleLogger
};
