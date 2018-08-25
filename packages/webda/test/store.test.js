"use strict";
var assert = require("assert");
const Webda = require("../lib/index.js");
var config = require("./config.json");
const Idents = require("./models/ident");
const Utils = require("./utils");
var user1;
var user2;
var ident1;
var ident2;
var executor;
var ctx;

function assertLastUpdateNotEqual(d1, d2, msg) {
  assert.notEqual(d1, d2, msg);
}
async function getAll(identStore, userStore) {
  var user1;
  var user3;
  user1 = await userStore.save({
    'name': 'test1'
  })
  await userStore.save({
    'name': 'test2'
  });
  user3 = await userStore.save({
    'name': 'test3'
  });
  let users = await userStore.getAll();
  assert.equal(users.length, 3);
  assert.equal(users[0] instanceof userStore._model, true);
  assert.equal(users[1] instanceof userStore._model, true);
  assert.equal(users[2] instanceof userStore._model, true);
  users = await userStore.getAll([user1.uuid, user3.uuid]);
  assert.equal(users.length, 2);
  assert.equal(users[0] instanceof userStore._model, true);
  assert.equal(users[1] instanceof userStore._model, true);
}

async function mapper(identStore, userStore) {
  var eventFired = 0;
  var events = ['Store.Save', 'Store.Saved', 'Store.Get', 'Store.Delete', 'Store.Deleted', 'Store.Update', 'Store.Updated', 'Store.Find', 'Store.Found'];
  for (let evt in events) {
    identStore.on(events[evt], function(evt) {
      eventFired++;
    });
  }
  assert.equal(await userStore.get(), undefined);
  user1 = (await userStore.save({
    'name': 'test'
  })).uuid;
  let user = await userStore.get(user1);
  // Save a user and add an ident
  assert.notEqual(user, undefined);
  user1 = user.uuid;
  ident1 = await identStore.save({
    "type": "facebook",
    "user": user.uuid
  });
  user = await userStore.get(user1);
  // Verify the ident is on the user
  assert.notEqual(user, undefined);
  assert.notEqual(user.idents, undefined);
  assert.equal(user.idents.length, 1);
  let lastUpdate = user.idents[0].lastUpdate;
  await Utils.sleep(10);
  await identStore.incrementAttribute(ident1.uuid, 'counter', 1);
  await user.refresh();
  assert.notEqual(user.idents[0].lastUpdate.length, 0);
  assertLastUpdateNotEqual(user.idents[0].lastUpdate, lastUpdate, 'lastUpdate on a map after incrementAttribute');
  lastUpdate = user.idents[0].lastUpdate;
  await Utils.sleep(10);
  await identStore.upsertItemToCollection(ident1.uuid, 'actions', {
    uuid: 'action_1',
    type: 'plop',
    date: new Date()
  });
  await user.refresh();
  assert.notEqual(user.idents[0].lastUpdate.length, 0);
  assertLastUpdateNotEqual(user.idents[0].lastUpdate, lastUpdate, 'lastUpdate on a map after upsertItemToCollection');
  lastUpdate = user.idents[0].lastUpdate;
  await Utils.sleep(10);
  await identStore.deleteItemFromCollection(ident1.uuid, 'actions', 0, 'plop', 'type');
  await user.refresh();
  assert.notEqual(user.idents[0].lastUpdate.length, 0);
  assertLastUpdateNotEqual(user.idents[0].lastUpdate, lastUpdate, 'lastUpdate on a map after deleteItemFromCollection');

  ident2 = await identStore.save({
    "type": "google",
    "user": user.uuid
  });
  // Add a second ident and check it is on the user aswell
  user = await userStore.get(user1);
  assert.equal(user.idents.length, 2);
  ident2.type = 'google2';
  // Update ident2 to check mapper update
  let res = await identStore.update({
    'uuid': ident2.uuid,
    'type': 'google2'
  });
  assert.equal(res.type, 'google2');
  assert.equal(res.user, user1);
  user = await userStore.get(user1);
  assert.equal(user.idents.length, 2);
  assert.equal(user.idents[1].type, "google2");
  assert.equal(user.idents[1] instanceof Idents, true);
  await identStore.delete(ident1.uuid);
  user = await userStore.get(user1);
  assert.equal(user.idents.length, 1);
  assert.equal(user.idents[0].type, "google2");
  // Add a second user to play
  user = await userStore.save({
    "name": "test2"
  });
  user2 = user.uuid;
  // Move ident2 from user1 to user2
  await identStore.update({
    'user': user.uuid,
    'uuid': ident2.uuid
  });
  // Check user1 has no more ident
  user = await userStore.get(user1);
  assert.equal(user.idents.length, 0);
  // Check user2 has one ident
  user = await userStore.get(user2);
  assert.equal(user.idents.length, 1);
  assert.equal(user.idents[0].type, "google2");
  // Verify you cannot update a collection from update
  await userStore.update({
    "idents": []
  }, user2);
  user = await userStore.get(user2);
  assert.equal(user.idents.length, 1);
  assert.equal(user.idents[0].type, "google2");
  // Verify delete cascade with empty collection
  await userStore.delete(user1);
  user = await userStore.get(user2);
  assert.equal(user.idents.length, 1);
  assert.equal(user.idents[0].type, "google2");
  // Verify delete cascade
  await userStore.delete(user2);
  let ident = await identStore.get(ident2.uuid);
  assert.equal(ident.__deleted, true);
  assert.equal(eventFired, 13);
  await identStore.delete(ident2.uuid, true);
  ident = await identStore.get(ident2.uuid);
  assert.equal(ident, undefined);
  assert.equal(eventFired, 15);
}

async function collection(identStore) {
  var ident;
  ident = await identStore.save({
    'test': 'plop'
  });
  await identStore.upsertItemToCollection(ident.uuid, 'actions', {
    uuid: 'action_1',
    type: 'plop',
    date: new Date()
  });
  await ident.refresh();
  assert.notEqual(ident.actions, undefined);
  assert.equal(ident.actions.length, 1);
  await identStore.upsertItemToCollection(ident.uuid, 'actions', {
    uuid: 'action_2',
    type: 'plop',
    date: new Date()
  });
  await ident.refresh();
  assert.notEqual(ident.actions, undefined);
  assert.equal(ident.actions.length, 2);
  await identStore.upsertItemToCollection(ident.uuid, 'actions', {
    uuid: 'action_1',
    type: 'plop2',
    date: new Date()
  }, 0);
  await ident.refresh();
  assert.notEqual(ident.actions, undefined);
  assert.equal(ident.actions.length, 2);
  assert.equal(ident.actions[0].type, 'plop2');
  assert.equal(ident.actions[0].uuid, 'action_1');
  await Utils.throws(identStore.upsertItemToCollection.bind(identStore, ident.uuid, 'actions', {
    uuid: 'action_1',
    type: 'plop2',
    date: new Date()
  }, 0, 'plop', 'type'), err => true);
  await Utils.throws(identStore.deleteItemFromCollection.bind(identStore, ident.uuid, 'actions', 0, 'action_2'), err => true);
  await ident.refresh();
  assert.equal(ident.actions.length, 2);
  assert.equal(ident.actions[0].type, 'plop2');
  let lastUpdate = ident.lastUpdate;
  await Utils.sleep(10);
  await identStore.upsertItemToCollection(ident.uuid, 'actions', {
    uuid: 'action_1',
    type: 'plop',
    date: new Date()
  }, 0, 'plop2', 'type');
  await ident.refresh();
  assertLastUpdateNotEqual(ident.lastUpdate, lastUpdate, 'lastUpdate after upsertItemToColletion failed');
  lastUpdate = ident.lastUpdate;
  await Utils.sleep(10);
  await identStore.deleteItemFromCollection(ident.uuid, 'actions', 0, 'plop', 'type');
  ident = await identStore.get(ident.uuid);
  assertLastUpdateNotEqual(ident.lastUpdate, lastUpdate, 'lastUpdate after deleteItemToColletion failed');
  assert.notEqual(ident.actions, undefined);
  assert.equal(ident.actions.length, 1);
  assert.equal(ident.actions[0].type, 'plop');
  assert.equal(ident.actions[0].uuid, 'action_2');
}

async function crud(identStore, userStore) {
  var eventFired = 0;
  var events = ['Store.Save', 'Store.Saved', 'Store.Get', 'Store.Delete', 'Store.Deleted', 'Store.Update', 'Store.Updated', 'Store.Find', 'Store.Found'];
  for (let evt in events) {
    identStore.on(events[evt], function(evt) {
      eventFired++;
    });
  }
  // Check CREATE - READ
  let ident1 = await identStore.save({
    "test": "plop",
    'cool': '',
    'lastUsed': new Date(),
    'arr': [],
    'details': {
      'plop': 'plop1',
      'clean': undefined,
      'yop': 'pouf'
    }
  });
  assert.equal(eventFired, 2);
  assert.notEqual(ident1, undefined);
  eventFired = 0;
  let getter = await identStore.get(ident1.uuid);
  assert.equal(eventFired, 1);
  eventFired = 0;
  assert.notEqual(getter, undefined);
  assert.notEqual(getter.lastUsed, undefined);
  assert.notEqual(getter.lastUpdate, undefined);
  assert.equal(getter.uuid, ident1.uuid);
  assert.equal(getter.test, ident1.test);

  // Check UPDATE
  getter.test = "plop2"
  getter.details.plop = "plop2";
  getter.details.blank = '';
  getter.details.bouzouf = undefined;
  getter.empty = [];
  let object = await identStore.update(getter);
  assert.equal(eventFired, 2);
  eventFired = 0;
  object = await identStore.get(ident1.uuid);
  assert.equal(object.test, "plop2");
  assert.equal(object.details.plop, "plop2");
  getter = await identStore.get(object.uuid);
  assert.equal(eventFired, 2);
  assert.equal(getter.test, "plop2");
  await Utils.sleep(10);
  await identStore.incrementAttribute(ident1.uuid, 'counter', 1);
  let ident = await identStore.get(ident1.uuid);
  // Verify lastUpdate is updated too
  assertLastUpdateNotEqual(ident.lastUpdate, ident1.lastUpdate, 'lastUpdate after incrementAttribute failed');
  assert.equal(ident.counter, 1);
  await identStore.incrementAttribute(ident1.uuid, 'counter', 3);
  ident1 = await identStore.get(ident1.uuid);
  assert.equal(ident1.counter, 4);
  await identStore.incrementAttribute(ident1.uuid, 'counter', -6);
  let res = await identStore.exists(ident1.uuid);
  assert.equal(res, true);
  ident1 = await identStore.get(ident1.uuid);
  assert.equal(ident1.counter, -2);
  // Check DELETE
  eventFired = 0;
  await identStore.delete(ident1.uuid, true);
  assert.equal(eventFired, 2);
  eventFired = 0;
  ident = await identStore.get(ident1.uuid);
  assert.equal(ident, undefined);
  res = await identStore.exists(ident1.uuid);
  assert.equal(res, false);
};

var skipAWS = true;
var skipMongo = true;
describe('Store', () => {
  var webda;
  var identStore;
  var userStore;
  before(() => {
    skipMongo = process.env["WEBDA_MONGO_URL"] === undefined;
    skipAWS = process.env["WEBDA_AWS_TEST"] === undefined;
    if (skipAWS) {
      console.log("Not running DynamoStore test as no AWS env found");
    }
    if (skipMongo) {
      console.log("Not running MongoStore test as no MONGO env found");
    }
  });
  beforeEach(() => {
    webda = new Webda.Core(config);
  });
  describe('FileStore', () => {
    beforeEach(() => {
      identStore = webda.getService("Idents");
      userStore = webda.getService("Users");
      assert.notEqual(identStore, undefined);
      assert.notEqual(userStore, undefined);
      identStore.__clean();
      userStore.__clean();
    });
    it('Basic CRUD', () => {
      return crud(identStore, userStore);
    });
    it('Collection CRUD', () => {
      return collection(identStore);
    });
    it('Mapper', () => {
      return mapper(identStore, userStore);
    });
    it('GetAll / Scan', () => {
      return getAll(identStore, userStore);
    });

    it('Model actions', async () => {
      let eventFired = 0;
      identStore.on('Store.Action', (evt) => {
        eventFired++;
      });
      identStore.on('Store.Actioned', (evt) => {
        eventFired++;
      });
      ctx = webda.newContext({
        "type": "CRUD",
        "uuid": "PLOP"
      });
      executor = webda.getExecutor(ctx, "test.webda.io", "PUT", "/idents/coucou/plop");
      assert.notEqual(executor, undefined);
      await Utils.throws(executor.execute.bind(executor, ctx), err => err == 404);
      await identStore.save({
        uuid: 'coucou'
      });
      await executor.execute(ctx);
      // Our fake action is pushing true to _plop
      assert.equal(JSON.parse(ctx._body)._plop, true);
      assert.equal(eventFired, 2);
      assert.notEqual(webda.getExecutor(ctx, "test.webda.io", "POST", "/idents/coucou/yop"), null);
      assert.notEqual(webda.getExecutor(ctx, "test.webda.io", "GET", "/idents/coucou/yop"), null);
    });

    it('Model static actions', async () => {
      let eventFired = 0;
      identStore.on('Store.Action', (evt) => {
        eventFired++;
      });
      ctx = webda.newContext({
        "type": "CRUD",
        "uuid": "PLOP"
      });
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/idents/index");
      assert.notEqual(executor, undefined);
      await executor.execute(ctx);
      // Our fake index action is just outputing 'indexer'
      assert.equal(ctx._body, 'indexer');
      assert.equal(eventFired, 1);
    });

  });
  describe('Store', () => {
    var eventFired = 0;
    // Check Store HTTP mapping
    it('HTTP CRUD', async () => {
      ctx = webda.newContext({
        "type": "CRUD",
        "uuid": "PLOP"
      });
      ctx.session.login("fake_user", "fake_ident");
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/users");
      assert.notEqual(executor, undefined);
      await executor.execute(ctx);
      ctx.body = undefined;
      await webda.getExecutor(ctx, "test.webda.io", "GET", "/users/PLOP").execute(ctx);
      assert.notEqual(ctx._body, undefined);
      assert.equal(ctx._body.indexOf("lastUpdate") >= 0, true);
      ctx.body = {
        "type": "CRUD2",
        "uuid": "PLOP"
      };
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/users");
      await Utils.throws(executor.execute.bind(executor, ctx), err => err == 409);
      // Verify the none overide of UUID
      ctx.body = {
        "type": "CRUD2",
        "uuid": "PLOP2"
      };
      executor = webda.getExecutor(ctx, "test.webda.io", "PUT", "/users/PLOP");
      await executor.execute(ctx);
      let user = await userStore.get("PLOP");
      assert.equal(user.uuid, "PLOP");
      assert.equal(user.type, "CRUD2");
      ctx._body = undefined;
      await webda.getExecutor(ctx, "test.webda.io", "DELETE", "/users/PLOP").execute(ctx);
      eventFired = 0;
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/users/PLOP");
      await Utils.throws(executor.execute.bind(executor, ctx), err => err == 404);
      eventFired++;
      executor = webda.getExecutor(ctx, "test.webda.io", "DELETE", "/users/PLOP");
      await Utils.throws(executor.execute.bind(executor, ctx), err => err == 404);
      eventFired++;
      executor = webda.getExecutor(ctx, "test.webda.io", "PUT", "/users/PLOP");
      await Utils.throws(executor.execute.bind(executor, ctx), err => err == 404);
      eventFired++;
      assert.equal(eventFired, 3);
    });
    it('Get URL', () => {
      assert.equal(webda.getService('dynamousers').getUrl(), '/users');
    });
  });
  describe('MongoStore', () => {
    afterEach(() => {
      identStore = webda.getService("mongoidents");
      userStore = webda.getService("mongousers");
      identStore._client.logout();
      userStore._client.logout();
      identStore._client.close();
      userStore._client.close();
    });
    beforeEach(async () => {
      if (skipMongo) {
        return;
      }
      identStore = webda.getService("mongoidents");
      userStore = webda.getService("mongousers");
      assert.notEqual(identStore, undefined);
      assert.notEqual(userStore, undefined);
      await identStore.__clean();
      await userStore.__clean();
    });
    it('Basic CRUD', function() {
      if (skipMongo) {
        this.skip();
        return;
      }
      return crud(identStore, userStore);
    });
    it('Collection CRUD', function() {
      if (skipMongo) {
        this.skip();
        return;
      }
      return collection(identStore);
    });
    it('Mapper', function() {
      if (skipMongo) {
        this.skip();
        return;
      }
      return mapper(identStore, userStore);
    });
    it('GetAll / Scan', function() {
      if (skipMongo) {
        this.skip();
        return;
      }
      return getAll(identStore, userStore);
    });
  });
  describe('MemoryStore', () => {
    var failed = false;
    beforeEach(async () => {
      identStore = webda.getService("memoryidents");
      userStore = webda.getService("memoryusers");
      assert.notEqual(identStore, undefined);
      assert.notEqual(userStore, undefined);
      await identStore.__clean();
      await userStore.__clean();
    });
    it('Basic CRUD', () => {
      return crud(identStore, userStore);
    });
    it('Collection CRUD', () => {
      return collection(identStore);
    });
    it('Mapper', () => {
      return mapper(identStore, userStore);
    });
    it('GetAll / Scan', () => {
      return getAll(identStore, userStore);
    });
    it('asyncDeleteHttp', async () => {
      await identStore.save({
        uuid: 'toDelete',
        test: 'ok'
      });
      await identStore.delete('toDelete');
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/memory/idents/toDelete");
      assert.notEqual(executor, undefined);
      await Utils.throws(executor.execute.bind(executor, ctx), err => err == 404);
      executor = webda.getExecutor(ctx, "test.webda.io", "PUT", "/memory/idents/toDelete");
      assert.notEqual(executor, undefined);
      await Utils.throws(executor.execute.bind(executor, ctx), err => err == 404);
      executor = webda.getExecutor(ctx, "test.webda.io", "DELETE", "/memory/idents/toDelete");
      assert.notEqual(executor, undefined);
      await Utils.throws(executor.execute.bind(executor, ctx), err => err == 404);
    });
  });
  describe('DynamoStore', () => {
    beforeEach(async () => {
      if (skipAWS) {
        return;
      }
      identStore = webda.getService("dynamoidents");
      userStore = webda.getService("dynamousers");
      assert.notEqual(identStore, undefined);
      assert.notEqual(userStore, undefined);

      await identStore.__clean();
      await userStore.__clean();
    });
    it('Basic CRUD', function() {
      if (skipAWS) {
        this.skip();
        return;
      }
      return crud(identStore, userStore);
    });
    it('Collection CRUD', function() {
      if (skipAWS) {
        this.skip();
        return;
      }
      return collection(identStore);
    });
    it('Mapper', function() {
      if (skipAWS) {
        this.skip();
        return;
      }
      return mapper(identStore, userStore);
    });
    it('GetAll / Scan', function() {
      if (skipAWS) {
        this.skip();
        return;
      }
      return getAll(identStore, userStore);
    });
    it('Date handling', async function() {
      if (skipAWS) {
        this.skip();
        return;
      }
      await userStore.save({
        "uuid": "testUpdate",
        "subobject": {
          "empty": "",
          "t": {
            "plop": ""
          },
          "date": new Date()
        }
      });
      let user = await userStore.get("testUpdate");
      assert.notEqual(user.date, {});
    });
    it('Body cleaning', () => {
      //var parse = require("./data/to_clean.json");
      userStore = webda.getService("dynamousers");
      let clean = userStore._cleanObject(new Idents({
        arr: [{
          value: '',
          test: 'oki'
        }, {
          value: ''
        }, {
          value: 'Test'
        }],
        sub: {
          value: ''
        },
        __store: userStore
      }, true));
      assert.equal(clean.sub.value, undefined);
      assert.equal(clean.__store, undefined);
      assert.equal(clean.arr instanceof Array, true);
      assert.equal(clean.arr[0].value, undefined);
      assert.equal(clean.arr[1].value, undefined);
      assert.notEqual(clean.arr[2].value, undefined);
    });
    it('ARN Policy', () => {
      userStore = webda.getService("dynamousers");
      userStore._params.region = 'eu-west-1';
      assert.equal(userStore.getARNPolicy('666').Resource[0], "arn:aws:dynamodb:eu-west-1:666:table/webda-test-users");
      userStore._params.region = undefined;
      assert.equal(userStore.getARNPolicy('777').Resource[0], "arn:aws:dynamodb:us-east-1:777:table/webda-test-users");
    });
  });
});
