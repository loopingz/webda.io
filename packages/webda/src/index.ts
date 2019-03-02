import { Webda, _extend } from "./core";
import { Service } from "./services/service";
import { Executor } from "./services/executor";
import { AWSMixIn, GetAWS } from "./services/aws-mixin";
// Policies
import { OwnerPolicy } from "./policies/ownerpolicy";
// Models
import { CoreModel, CoreModelDefinition } from "./models/coremodel";
import { Ident } from "./models/ident";
import { User } from "./models/user";
// Utils
import { Context, ClientInfo, HttpContext } from "./utils/context";
import { SecureCookie } from "./utils/cookie";
import { LambdaCaller } from "./utils/lambdacaller";
// Handler
import { LambdaServer, AWSEventHandlerMixIn } from "./handlers/lambda";
// Store
import { Store } from "./stores/store";

import { DynamoStore } from "./stores/dynamodb";
import { FileStore } from "./stores/file";
import { MemoryStore } from "./stores/memory";
import { MongoStore } from "./stores/mongodb";
// Loggers
import { Logger } from "./loggers/logger";
import { MemoryLogger } from "./loggers/memorylogger";
import { ConsoleLogger } from "./loggers/consolelogger";
import { CloudWatchLogger } from "./loggers/cloudwatchlogger";
// Services
import { Mailer } from "./services/mailer";
import { Authentication } from "./services/authentication";
import { EventService } from "./services/asyncevents";
import { Binary } from "./services/binary";
import { FileBinary } from "./services/filebinary";
import { S3Binary } from "./services/s3binary";
import { ResourceService } from "./services/resource";
import {
  ConfigurationProvider,
  ConfigurationService
} from "./services/configuration";
import { AwsSecretsManager } from "./services/secretsmanager";
// Queues
import { Queue } from "./queues/queueservice";
import { SQSQueue } from "./queues/sqsqueue";
import { MemoryQueue } from "./queues/memoryqueue";

export {
  Webda as Core,
  _extend,
  // Services
  Service,
  Executor,
  OwnerPolicy,
  EventService,
  ResourceService,
  AWSMixIn,
  GetAWS,
  Binary,
  FileBinary,
  Mailer,
  Authentication,
  S3Binary,
  ConfigurationProvider,
  ConfigurationService,
  AwsSecretsManager,
  // Store
  Store,
  DynamoStore,
  FileStore,
  MemoryStore,
  MongoStore,
  // Queues
  Queue,
  SQSQueue,
  MemoryQueue,
  // Models
  CoreModel,
  CoreModelDefinition,
  Ident,
  User,
  // Utils
  SecureCookie,
  LambdaCaller,
  Context,
  ClientInfo,
  HttpContext,
  // Handler
  AWSEventHandlerMixIn,
  LambdaServer,
  Logger,
  MemoryLogger,
  ConsoleLogger,
  CloudWatchLogger
};
