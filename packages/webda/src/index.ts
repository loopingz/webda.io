import { Webda, _extend } from './core';
import { Service } from './services/service';
import { Executor } from './services/executor';
// Policies
import { OwnerPolicy } from './policies/ownerpolicy';
// Models
import { CoreModel } from './models/coremodel';
import { Ident } from './models/ident';
import { User } from './models/user';
// Utils
import { Context } from './utils/context';
import { SecureCookie } from './utils/cookie';
import { LambdaCaller } from './utils/lambdacaller';
// Handler
import { LambdaHandler } from './handlers/lambda';
// Store
import { Store } from './stores/store';
// Services
import { Mailer } from './services/mailer';
import { Authentication } from './services/authentication';


const AsyncEvents = require('./services/asyncevents');
const AWSMixIn = require('./services/aws-mixin');
const Binary = require('./services/binary');
const FileBinary = require('./services/filebinary');

const S3Binary = require('./services/s3binary');
// Store
const DynamoDBStore = require('./stores/dynamodb');
const FileStore = require('./stores/file');
const MemoryStore = require('./stores/memory');
const MongoDBStore = require('./stores/mongodb');
// Queues
const Queue = require('./queues/queueservice');
const SQSQueue = require('./queues/sqsqueue');
const MemoryQueue = require('./queues/memoryqueue');

export {
  Webda as Core,
  _extend,
  // Services
  Service,
  Executor,
  OwnerPolicy,
  AsyncEvents,
  AWSMixIn,
  Binary,
  FileBinary,
  Mailer,
  Authentication,
  S3Binary,
  // Store
  Store,
  DynamoDBStore,
  FileStore,
  MemoryStore,
  MongoDBStore,
  // Queues
  Queue,
  SQSQueue,
  MemoryQueue,
  // Models
  CoreModel,
  Ident,
  User,
  // Utils
  SecureCookie,
  LambdaCaller,
  Context,
  // Handler
  LambdaHandler
}